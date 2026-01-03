// Socket.IO type augmentation
// This extends the SocketData interface to include our custom user property

import type { VerifiedUser } from "../auth/jwt";

declare module "socket.io" {
  interface SocketData {
    user?: VerifiedUser;
  }
}

