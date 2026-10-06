import { useEffect, useState } from 'react';
import { getSocket } from '../utils/socket';

/**
 * Returns the shared live-update client.
 *
 * Everything real lives in utils/socket.js — this hook just hands the same
 * single instance to any component that asks, so the app holds one
 * connection rather than one per component.
 */
export function useSocket() {
  const [socket, setSocket] = useState(() => getSocket());

  useEffect(() => {
    setSocket(getSocket());
    // Deliberately no cleanup: the connection is shared and should stay
    // open for the lifetime of the app.
  }, []);

  return socket;
}
