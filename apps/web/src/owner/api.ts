import { client } from '@call-calendar/api-contract/sdk-client';

export class SessionExpired extends Error {}

client.setConfig({ baseUrl: window.location.origin });
// Every generated SDK call shares this boundary. A 401 discards the mounted owner
// section before login; only route state survives, never a mutation or unsaved form.
client.interceptors.response.use((response) => {
  if (response.status === 401 && !new URL(response.url).pathname.endsWith('/owner/login')) {
    window.dispatchEvent(new CustomEvent('owner-session-expired'));
    throw new SessionExpired();
  }
  return response;
});
