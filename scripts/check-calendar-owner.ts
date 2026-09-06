import { getGoogleOAuthToken } from '../lib/calendar/google';

async function main() {
  const token = await getGoogleOAuthToken();
  console.log('Token exists?:', Boolean(token));
  if (!token) return;

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Primary Calendar Data:', data);

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (userinfoRes.ok) {
    console.log('Userinfo Data:', await userinfoRes.json());
  } else {
    console.log('Userinfo Status:', userinfoRes.status, await userinfoRes.text());
  }
}

main();
