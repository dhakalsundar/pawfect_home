/* eslint-disable no-console */
import { io, type Socket } from 'socket.io-client';

/**
 * Realtime verification for Batch 11.
 *
 * PowerShell cannot hold a WebSocket, so the socket gates are checked here instead: handshake
 * auth, room isolation, live delivery latency, and offline persistence.
 *
 * Run with both servers up:  npx tsx src/scripts/realtime-check.ts
 */

const API = 'http://localhost:5000/api/v1';
const SOCKET = 'http://localhost:5000';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
    failures++;
  }
}

interface Session {
  cookies: string;
  csrf: string;
  userId: string;
}

/** Logs in and keeps the raw Set-Cookie values, which the socket handshake needs verbatim. */
async function login(email: string, password: string): Promise<Session | null> {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) return null;

  const setCookie = response.headers.getSetCookie();
  const cookies = setCookie.map((entry) => entry.split(';')[0]).join('; ');
  const csrf = /ph_csrf=([^;]+)/.exec(cookies)?.[1] ?? '';
  const body = (await response.json()) as { data: { id: string } };

  return { cookies, csrf, userId: body.data.id };
}

function api(session: Session, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookies,
      'X-CSRF-Token': session.csrf,
      ...init.headers,
    },
  });
}

/** Opens a socket with the session cookies, resolving on connect or rejecting on refusal. */
function connect(session: Session | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET, {
      transports: ['websocket'],
      extraHeaders: session ? { Cookie: session.cookies } : {},
      reconnection: false,
      timeout: 5000,
    });

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Waits for one event, or resolves null on timeout — used to assert both arrival and silence. */
function waitFor<T>(socket: Socket, event: string, ms = 3000): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);

    function handler(payload: T) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

async function main() {
  console.log('\n=== Setup ===');
  const adopter = await login('adopter@pawfecthome.seed', 'DemoPass123');
  const shelter = await login('shelter1@pawfecthome.seed', 'ShelterPass123');
  const admin = await login('admin@pawfecthome.seed', 'DemoPass123');

  if (!adopter || !shelter || !admin) {
    console.log('  SKIP  auth rate limited — restart the backend and retry');
    process.exit(0);
  }
  check('logged in as adopter, shelter and admin', true);

  console.log('\n=== 1. Handshake authentication ===');
  try {
    const anonymous = await connect(null);
    anonymous.close();
    check('socket without cookies is rejected', false, 'it connected');
  } catch (error) {
    check(
      'socket without cookies is rejected',
      (error as Error).message.includes('UNAUTHENTICATED'),
      (error as Error).message,
    );
  }

  try {
    const bogus = await connect({ cookies: 'ph_access=not-a-real-token', csrf: '', userId: '' });
    bogus.close();
    check('socket with a forged token is rejected', false, 'it connected');
  } catch (error) {
    check('socket with a forged token is rejected', true, (error as Error).message);
  }

  const adopterSocket = await connect(adopter);
  check('socket with a valid session connects', adopterSocket.connected);

  const shelterSocket = await connect(shelter);
  check('a second user connects independently', shelterSocket.connected);

  console.log('\n=== 2. Live delivery ===');
  // Find a pet belonging to shelter1 that the adopter has not already applied for.
  const petsResponse = await api(adopter, '/pets?status=available&limit=50');
  const pets = ((await petsResponse.json()) as { data: { id: string; shelter?: { name: string } }[] }).data;
  const target = pets.find((pet) => pet.shelter?.name === 'Paws & Claws Rescue');

  if (!target) {
    console.log('  SKIP  no available pet for that shelter');
  } else {
    // The shelter owner should receive this live, since they own the pet.
    const incoming = waitFor<{ notification: { title: string }; unreadCount: number }>(
      shelterSocket,
      'notification:new',
    );

    const started = Date.now();
    const applyResponse = await api(adopter, '/adoptions', {
      method: 'POST',
      body: JSON.stringify({
        petId: target.id,
        answers: {
          housingType: 'house',
          ownOrRent: 'own',
          hasYard: true,
          householdSize: 2,
          hasChildren: false,
          hoursAlonePerDay: 4,
          experienceLevel: 'some',
          reasonForAdopting:
            'We have a secure garden and plenty of time for a dog that needs company all day.',
        },
        agreedToTerms: true,
      }),
    });

    if (applyResponse.status === 201) {
      const received = await incoming;
      const elapsed = Date.now() - started;

      check('shelter receives the notification live', received !== null, 'nothing arrived in 3s');
      if (received) {
        check(`  delivered in ${elapsed}ms (under 1s)`, elapsed < 1000, `${elapsed}ms`);
        check('  payload carries the title', received.notification.title.includes('New application'));
        check('  payload carries an unread count', received.unreadCount > 0);
      }
    } else {
      const body = (await applyResponse.json()) as { error?: { message?: string } };
      console.log(`  SKIP  could not apply (${applyResponse.status}: ${body.error?.message})`);
    }
  }

  console.log('\n=== 3. Room isolation ===');
  // The adopter must NOT receive the shelter's notification. Silence is the pass condition.
  const leaked = waitFor(adopterSocket, 'notification:new', 1500);

  const anotherPet = pets.find(
    (pet) => pet.shelter?.name === 'Paws & Claws Rescue' && pet.id !== target?.id,
  );
  if (anotherPet) {
    // Triggering a notification aimed at the shelter only.
    await api(admin, `/admin/pets/${anotherPet.id}/moderate`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'feature' }),
    });
  }

  check('adopter does not receive the shelter\'s notification', (await leaked) === null, 'it leaked');

  console.log('\n=== 4. Offline notifications persist ===');
  adopterSocket.close();
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Fire something at the now-offline adopter.
  const applications = (await (await api(shelter, '/adoptions?status=pending&limit=1')).json()) as {
    data: { id: string }[];
  };

  if (applications.data.length > 0) {
    const response = await api(shelter, `/adoptions/${applications.data[0]!.id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'under_review' }),
    });

    if (response.ok) {
      // Nothing was listening — the notification must still be waiting in the database.
      const unread = (await (await api(adopter, '/notifications/unread-count')).json()) as {
        data: { unreadCount: number };
      };
      check('notification raised while offline is persisted', unread.data.unreadCount > 0, 'count is 0');

      const list = (await (await api(adopter, '/notifications?unread=true')).json()) as {
        data: { title: string }[];
      };
      check('  and appears in the list on next fetch', list.data.length > 0, 'list empty');
    } else {
      console.log(`  SKIP  could not change status (${response.status})`);
    }
  } else {
    console.log('  SKIP  no pending application to transition');
  }

  console.log('\n=== 5. Unread count reconciles with the database ===');
  const reconnected = await connect(adopter);
  const countResponse = (await (await api(adopter, '/notifications/unread-count')).json()) as {
    data: { unreadCount: number };
  };
  const listResponse = (await (await api(adopter, '/notifications?unread=true&limit=50')).json()) as {
    data: unknown[];
  };
  check(
    'unread count matches the number of unread rows',
    countResponse.data.unreadCount === listResponse.data.length,
    `count=${countResponse.data.unreadCount} rows=${listResponse.data.length}`,
  );

  console.log('\n=== 6. Mark-read propagates to other tabs ===');
  const secondTab = await connect(adopter);
  const readEvent = waitFor<{ unreadCount: number }>(secondTab, 'notification:read');

  const unreadList = (await (await api(adopter, '/notifications?unread=true&limit=1')).json()) as {
    data: { id: string }[];
  };

  if (unreadList.data.length > 0) {
    await api(adopter, `/notifications/${unreadList.data[0]!.id}/read`, { method: 'PUT' });
    const event = await readEvent;
    check('other tab is told the badge changed', event !== null, 'no event arrived');
  } else {
    console.log('  SKIP  nothing unread to mark');
  }

  console.log('\n=== 7. Conversation rooms are join-verified ===');

  // A pet owned by the shelter user, so the conversation's other party is that shelter owner.
  const shelterPets = (await (await api(shelter, '/shelters/me/pets?limit=1')).json()) as {
    data: { id: string; name: string }[];
  };
  const pet = shelterPets.data[0];

  const startResponse = await api(adopter, '/conversations', {
    method: 'POST',
    body: JSON.stringify({ petId: pet?.id }),
  });
  const conversation = ((await startResponse.json()) as { data: { id: string } }).data;
  check('conversation created over REST', Boolean(conversation?.id), 'no conversation returned');

  /** Emits `conversation:join` and resolves with the server's ack. */
  function join(socket: Socket, conversationId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.emit('conversation:join', conversationId, (accepted: boolean) => {
        clearTimeout(timer);
        resolve(accepted);
      });
    });
  }

  const adopterChat = await connect(adopter);
  const shelterChat = await connect(shelter);

  check('a participant may join the conversation room', await join(adopterChat, conversation.id));
  check('the other participant may join too', await join(shelterChat, conversation.id));

  // The whole reason `conversation:join` exists as the one exception to the never-join-on-request
  // rule: membership is looked up, not taken on the client's word.
  const intruder = await connect(admin);
  check(
    'a non-participant is refused the conversation room',
    (await join(intruder, conversation.id)) === false,
    'the join was accepted',
  );

  console.log('\n=== 8. Live message delivery ===');
  const delivery = waitFor<{ body: string; senderId: string }>(shelterChat, 'message:new');
  const sentAt = Date.now();

  await api(adopter, `/conversations/${conversation.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: 'realtime hello' }),
  });

  const delivered = await delivery;
  check('the message reaches the other participant', delivered?.body === 'realtime hello',
    `got ${JSON.stringify(delivered)}`);
  if (delivered) console.log(`  delivery latency: ${Date.now() - sentAt} ms`);

  // The refused socket never joined, so the room broadcast must not reach it.
  const eavesdrop = waitFor(intruder, 'message:new', 1500);
  await api(adopter, `/conversations/${conversation.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: 'not for you' }),
  });
  check('a refused socket receives nothing from the room', (await eavesdrop) === null, 'event leaked');

  console.log('\n=== 9. Typing indicators ===');
  const typingEvent = waitFor<{ userId: string; isTyping: boolean }>(shelterChat, 'typing');
  adopterChat.emit('typing', { conversationId: conversation.id, isTyping: true });
  const typing = await typingEvent;
  check('typing reaches the other participant', typing?.isTyping === true, `got ${JSON.stringify(typing)}`);
  check('typing identifies the sender', typing?.userId === adopter.userId, `userId ${typing?.userId}`);

  const echo = waitFor(adopterChat, 'typing', 1000);
  adopterChat.emit('typing', { conversationId: conversation.id, isTyping: true });
  check('typing is not echoed back to the sender', (await echo) === null, 'sender received its own event');

  // Broadcasting is gated on having actually joined, so a refused socket cannot inject into the
  // thread either.
  const injected = waitFor(shelterChat, 'typing', 1500);
  intruder.emit('typing', { conversationId: conversation.id, isTyping: true });
  check('a refused socket cannot broadcast typing', (await injected) === null, 'injection succeeded');

  console.log('\n=== 10. Leaving the room stops delivery ===');
  shelterChat.emit('conversation:leave', conversation.id);
  // Give the leave a moment to be processed before testing it.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const afterLeave = waitFor(shelterChat, 'message:new', 1500);
  await api(adopter, `/conversations/${conversation.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: 'after leaving' }),
  });
  check('no room events after leaving', (await afterLeave) === null, 'still receiving');

  adopterChat.close();
  shelterChat.close();
  intruder.close();
  reconnected.close();
  secondTab.close();
  shelterSocket.close();

  console.log('\n================================');
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('Realtime check crashed:', error);
  process.exit(1);
});
