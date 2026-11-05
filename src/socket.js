import { io } from 'socket.io-client';

export const socket = io();

export function call(event, payload = {}) {
  return new Promise(resolve => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) resolve({ error: 'Connexion au serveur impossible', timeout: true });
      else resolve(res && typeof res === 'object' ? res : {});
    });
  });
}
