import { getGoogleOAuthToken } from '../lib/calendar/google';

async function main() {
  const token = await getGoogleOAuthToken();
  if (!token) return;

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Gmail Profile Status:', res.status);
  const data = await res.json();
  console.log('Gmail Profile Data:', data);
}

main();
