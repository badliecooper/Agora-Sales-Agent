import { getGoogleOAuthToken } from '../lib/calendar/google';

async function main() {
  const token = await getGoogleOAuthToken();
  if (!token) return;

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
  const data = await res.json();
  console.log('Token Info:', data);
}

main();
