import { createFrontendServer } from './frontend-server.js';

const server = createFrontendServer();
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () =>
  console.log(`Frontend: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`),
);
