import {
  analyzeAndUpdateSalesState,
  createInitialSalesState,
} from '../lib/sales/tracker';

const realCallHistory = [
  { role: 'assistant', content: "Hi there! I'm Ada from Agora. Before we dive in, what should I call you and which company are you with?" },
  { role: 'user', content: "Hi, Sam. From Voice Masters." },
  { role: 'assistant', content: "Great to meet you, Sam! What's your role at Voice Masters?" },
  { role: 'assistant', content: "I didn't catch your role at Voice Masters. Could you share that with me?" },
  { role: 'user', content: "My name is Yaduraj." },
  { role: 'assistant', content: "Thanks for that, Yaduraj! What’s your role at Voice Masters?" },
  { role: 'user', content: "Manager." },
  { role: 'assistant', content: "Got it, Yaduraj! So you're a Manager at Voice Masters. What's the best email address to send our solution architecture and pricing breakdown to?" },
  { role: 'user', content: "Would be a new Dodge? S p dot" },
  { role: 'user', content: "g mail dot com." },
  { role: 'assistant', content: "Thank you for the email, Yaduraj! Just to confirm, is that newdodge. sp@gmail. com? Also, what's a good phone number for our team to follow up with you?" },
  { role: 'user', content: "It's yaduraj dot s p." },
  { role: 'assistant', content: "Just to clarify, is your email yaduraj. sp@gmail. com? If so, could you please provide a good phone number for our team to reach you?" },
  { role: 'user', content: "That's on nine three zero." },
  { role: 'user', content: "Two four seven" },
  { role: 'user', content: "six seven nine one." },
  { role: 'assistant', content: "Thank you for the phone number, Yaduraj! So, to recap, I have your details as follows:- Name: Yaduraj- Company: Voice Masters- Role: Manager- Email: yaduraj. sp@gmail. com- Phone: 930-247-6791Now, how many support agents or monthly voice minutes are you expecting?" },
  { role: 'user', content: "Oh, a hundred hours." },
  { role: 'assistant', content: "Thanks for sharing that, Yaduraj! Just to clarify, that's about 100 hours of monthly voice usage. What is your target budget and go-live timeline for this initiative?" },
  { role: 'user', content: "My target budget would be around ten k dollars and" },
  { role: 'assistant', content: "Got it, Yaduraj! So your target budget is around $10,000. When are you looking to go live with this initiative?" },
  { role: 'user', content: "Around one month." },
  { role: 'assistant', content: "Thank you for that information, Yaduraj! So to recap, your target budget is $10,000, and you're aiming to go live in about one month. Now that I have all your details, let's discuss how Agora's Conversational AI platform can meet your needs. Are you looking for a technical demo to see how it all works?" },
  { role: 'assistant', content: "It looks like we have all your details collected, Yaduraj! Just to confirm, you're the Manager at Voice Masters, with an email of yaduraj. sp@gmail. com, and a phone number of 930-247-6791. You're expecting about 100 hours of monthly voice usage, with a target budget of $10,000, and you're looking to go live in one month. Shall we set up a live technical demo with our engineering team to discuss how Agora's Conversational AI can meet your needs?" },
  { role: 'user', content: "Yeah. Yeah. Yeah. Right. Absolutely." },
  { role: 'assistant', content: "Great! Now that we have everything, how can I assist you further? Would you like to discuss our Conversational AI solutions in more detail or perhaps set up a live technical demo with our engineering team?" },
  { role: 'user', content: "Why should I go with Agora? Instead of its competitors?" },
  { role: 'assistant', content: "That's a great question, Yaduraj! Agora stands out because we offer ultra-low latency communication, with response times that can be" },
  { role: 'user', content: "Other other competitors are pretty cheap." },
  { role: 'assistant', content: "I understand that pricing is a key factor, Yaduraj. While some competitors may offer lower prices, Agora provides superior real-time engagement capabilities, including sub-500ms latency and intelligent interruption handling..." },
  { role: 'user', content: "No. But the second time, why should I go with Agora?" },
  { role: 'assistant', content: "Absolutely, Yaduraj! In addition to our low latency, Agora offers flexible integrations with various AI models..." },
  { role: 'user', content: "And I'm getting my point." },
  { role: 'assistant', content: "I appreciate your patience, Yaduraj! To summarize, Agora not only provides low-latency communication..." },
  { role: 'user', content: "No. No. No. No." },
  { role: 'user', content: "The thing is" },
  { role: 'user', content: "what I need is satisfied by the competitors at a much lower rate." },
  { role: 'user', content: "Why should I go with Agora?" },
  { role: 'assistant', content: "I completely understand your concern, Yaduraj. While competitors may offer lower prices, Agora's value lies in our high-quality real-time engagement..." },
  { role: 'user', content: "It's all good. Just end the call now." },
  { role: 'assistant', content: "Before we wrap up, could you quickly share your email address so I can send over our pricing breakdown and follow up?" },
  { role: 'user', content: "Yaduraj SP and the red g mail." },
  { role: 'assistant', content: "Thank you for that, Yaduraj! Just to confirm, is your email address yaduraj. sp@gmail. com?" },
  { role: 'user', content: "Yeah. Correct. Correct. Correct." },
  { role: 'assistant', content: "Great! I've noted your details, and I'll follow up with the pricing breakdown at yaduraj. sp@gmail. com. If you have any more questions or need assistance in the future, feel free to reach out. Have a wonderful day!" },
  { role: 'user', content: "Okay." }
];

const sessionId = 'turn-by-turn-test';
let state = createInitialSalesState(sessionId);

const origLog = console.log;
for (let i = 1; i <= realCallHistory.length; i++) {
  const currentMessages = realCallHistory.slice(0, i);
  console.log = () => {};
  state = analyzeAndUpdateSalesState(state, currentMessages);
  console.log = origLog;
  console.log(`[Turn ${i.toString().padStart(2, '0')}] ${currentMessages[i-1].role.padEnd(9)} | Name: "${state.customer.fullName || ''}" | Comp: "${state.customer.company || ''}" | Role: "${state.customer.jobTitle || ''}" | Email: "${state.customer.email || ''}" | Phone: "${state.customer.phone || ''}" | Need: "${state.qualification.need || ''}"`);
}

console.log('\n--- Final Turn 46 State Check ---');
console.log('Customer Name :', state.customer.fullName);
console.log('Company       :', state.customer.company);
console.log('Role          :', state.customer.jobTitle);
console.log('Email         :', state.customer.email);
console.log('Phone         :', state.customer.phone);
console.log('Company Size  :', state.customer.companySize);
console.log('Budget        :', state.qualification.budget);
console.log('Timeline      :', state.qualification.timeline);
console.log('Need          :', state.qualification.need);

if (state.customer.fullName !== 'Yaduraj') throw new Error(`Expected Yaduraj, got ${state.customer.fullName}`);
if (state.customer.company !== 'Voice Masters') throw new Error(`Expected Voice Masters, got ${state.customer.company}`);
if (state.customer.jobTitle !== 'Manager') throw new Error(`Expected Manager, got ${state.customer.jobTitle}`);
if (state.customer.email !== 'yaduraj.sp@gmail.com') throw new Error(`Expected yaduraj.sp@gmail.com, got ${state.customer.email}`);
if (state.customer.phone !== '930-247-6791') throw new Error(`Expected 930-247-6791, got ${state.customer.phone}`);
if (state.customer.companySize !== '100 hours/month') throw new Error(`Expected 100 hours/month, got ${state.customer.companySize}`);
if (state.qualification.budget !== '$10,000') throw new Error(`Expected $10,000, got ${state.qualification.budget}`);
if (!state.qualification.timeline?.includes('month')) throw new Error(`Expected 1 month, got ${state.qualification.timeline}`);
if (!state.qualification.need) throw new Error(`Expected valid need, got ${state.qualification.need}`);

console.log('\nAll Turn-by-Turn assertions passed! 🎉');


