import {
  analyzeAndUpdateSalesState,
  createInitialSalesState,
  extractFacts,
  extractSpokenEmail,
  extractSpokenPhone,
  parseBudgetString,
  buildStructuredCrmPayload,
} from '../lib/sales/tracker';
import { processSalesBrain } from '../lib/sales/brain';
import { ChatMessage } from '../lib/sales/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('  VERIFYING SPOKEN EXTRACTION & ZERO REPETITION BEHAVIOR        ');
  console.log('================================================================\n');

  // TEST 1: Spoken Email Extraction
  console.log('[TEST 1] Spoken Email Formats');
  const email1 = extractSpokenEmail('My email is alex at cloudcorp dot com please send details');
  assert(email1 === 'alex@cloudcorp.com', `Extracts "alex at cloudcorp dot com" -> ${email1}`);

  const email2 = extractSpokenEmail('You can reach me at john.doe at acme dot io');
  assert(email2 === 'john.doe@acme.io', `Extracts "john.doe at acme dot io" -> ${email2}`);

  const email3 = extractSpokenEmail('my work email is dev.lead at company.com');
  assert(email3 === 'dev.lead@company.com', `Extracts "dev.lead at company.com" -> ${email3}`);

  const email4 = extractSpokenEmail('standard email test@example.org thanks');
  assert(email4 === 'test@example.org', `Extracts standard "test@example.org" -> ${email4}`);

  // TEST 2: Spoken Phone Extraction
  console.log('\n[TEST 2] Spoken Phone Formats');
  const phone1 = extractSpokenPhone('phone number is 5 5 5 1 2 3 4 5 6 7 thank you');
  assert(phone1 === '5551234567', `Extracts spaced digits "5 5 5 1 2 3 4 5 6 7" -> ${phone1}`);

  const phone2 = extractSpokenPhone('call me at +1 555 987 6543');
  assert(phone2 === '+1 555 987 6543', `Extracts "+1 555 987 6543" -> ${phone2}`);

  const phone3 = extractSpokenPhone('my phone is five five five one two three four five six seven');
  assert(phone3 === '5551234567' || phone3 === '555-123-4567', `Extracts digit words "five five five..." -> ${phone3}`);

  // TEST 3: Multi-Word Company and Casual Name
  console.log('\n[TEST 3] Spoken Name & Multi-word Company');
  const facts1 = extractFacts("I'm Alex Vance, working at CloudCorp Technologies as VP of Engineering");
  assert(facts1.name?.fullName === 'Alex Vance', `Name captured: "${facts1.name?.fullName}"`);
  assert(facts1.company === 'CloudCorp Technologies', `Multi-word company captured: "${facts1.company}"`);
  assert(facts1.role === 'VP of Engineering', `Role captured: "${facts1.role}"`);

  // TEST 4: Word Numbers in Budget & Scale
  console.log('\n[TEST 4] Spoken Budget & Team Size');
  const budget1 = parseBudgetString('our budget is fifty thousand dollars');
  assert(budget1?.budget === '$50,000', `Word budget parsed: "${budget1?.budget}"`);

  const budget2 = parseBudgetString('we have 50k allocated for this');
  assert(budget2?.budget === '$50,000', `50k budget parsed: "${budget2?.budget}"`);

  const facts2 = extractFacts('we have fifty support agents and need it within two months');
  assert(facts2.companySize === '50 support agents', `Word company size captured: "${facts2.companySize}"`);
  assert(facts2.timeline === '2 months', `Word timeline captured: "${facts2.timeline}"`);

  // TEST 5: Single-turn Multi-Field Extraction
  console.log('\n[TEST 5] Single-turn Multi-Field Extraction (All info at once)');
  const allInOne = "Hello! My name is Sarah Connor. I work at Cyberdyne Systems as Director of Security. My email is sarah at cyberdyne dot com and phone is +1 555 987 6543. We have 100 agents, an allocated budget of $60,000, and need deployment in 3 months.";
  const multiState = analyzeAndUpdateSalesState(createInitialSalesState('test-all-in-one'), [
    { role: 'user', content: allInOne },
  ]);

  assert(multiState.customer.fullName === 'Sarah Connor', `Name: "${multiState.customer.fullName}"`);
  assert(multiState.customer.company === 'Cyberdyne Systems', `Company: "${multiState.customer.company}"`);
  assert(multiState.customer.jobTitle === 'Director of Security', `Role: "${multiState.customer.jobTitle}"`);
  assert(multiState.customer.email === 'sarah@cyberdyne.com', `Email: "${multiState.customer.email}"`);
  assert(multiState.customer.phone === '+1 555 987 6543', `Phone: "${multiState.customer.phone}"`);
  assert(multiState.customer.companySize === '100 agents', `Company Size: "${multiState.customer.companySize}"`);
  assert(multiState.qualification.budget === '$60,000', `Budget: "${multiState.qualification.budget}"`);
  assert(multiState.qualification.timeline === '3 months', `Timeline: "${multiState.qualification.timeline}"`);

  // Verify dashboard collection status
  assert(multiState.crmCollectionStatus.name === true, 'crmCollectionStatus.name is true');
  assert(multiState.crmCollectionStatus.company === true, 'crmCollectionStatus.company is true');
  assert(multiState.crmCollectionStatus.role === true, 'crmCollectionStatus.role is true');
  assert(multiState.crmCollectionStatus.email === true, 'crmCollectionStatus.email is true');
  assert(multiState.crmCollectionStatus.phone === true, 'crmCollectionStatus.phone is true');
  assert(multiState.crmCollectionStatus.budget === true, 'crmCollectionStatus.budget is true');
  assert(multiState.crmCollectionStatus.timeline === true, 'crmCollectionStatus.timeline is true');

  // TEST 6: Zero Re-asking when all info is provided
  console.log('\n[TEST 6] Zero Re-asking when information is known');
  assert(multiState.nextQuestion === null, 'multiState.nextQuestion is null (No questions pending)');
  assert(multiState.nextInfoToCollect === null, 'multiState.nextInfoToCollect is null (All fields collected)');

  const brainAllInOne = await processSalesBrain({
    sessionId: 'test-all-in-one',
    messages: [{ role: 'user', content: allInOne }],
  });
  assert(
    brainAllInOne.systemPrompt.includes('All essential customer qualification and contact information is already collected'),
    'Sales Brain directive commands agent NOT to re-ask for collected info',
  );
  assert(
    brainAllInOne.systemPrompt.includes('DO NOT re-ask for customer name, company, role, email, phone, size, budget, or timeline'),
    'Sales Brain explicitly forbids repeating questions',
  );

  // TEST 7: Turn-by-turn zero repetition progression
  console.log('\n[TEST 7] Step-by-Step Questioning Without Repeating');
  let state = createInitialSalesState('test-step-by-step');
  const history: ChatMessage[] = [];

  // Turn 1: Caller states name
  history.push({ role: 'user', content: 'Hi, I am Jordan' });
  state = analyzeAndUpdateSalesState(state, history);
  assert(state.customer.fullName === 'Jordan', 'Captured Name: Jordan');
  assert(state.nextQuestion?.field !== 'name', `Next question target is "${state.nextQuestion?.field}" (NOT name again)`);

  // Turn 2: Agent asked for company, caller gives company
  history.push({ role: 'assistant', content: state.nextQuestion?.question || 'Which company are you with?' });
  history.push({ role: 'user', content: 'I am with Northstar Tech' });
  state = analyzeAndUpdateSalesState(state, history);
  assert(state.customer.company === 'Northstar Tech', 'Captured Company: Northstar Tech');
  assert(state.nextQuestion?.field !== 'name' && state.nextQuestion?.field !== 'company',
    `Next question target is "${state.nextQuestion?.field}" (NOT name or company again)`);

  // Turn 3: Agent asked for role, caller gives role
  history.push({ role: 'assistant', content: state.nextQuestion?.question || "What's your role?" });
  history.push({ role: 'user', content: 'I work as a Solutions Architect' });
  state = analyzeAndUpdateSalesState(state, history);
  assert(state.customer.jobTitle === 'Solutions Architect', 'Captured Role: Solutions Architect');
  assert(state.nextQuestion?.field !== 'jobTitle', `Next question is NOT role again`);

  // Turn 4: Caller gives email
  history.push({ role: 'assistant', content: state.nextQuestion?.question || "What is your email?" });
  history.push({ role: 'user', content: 'My email is jordan at northstar dot com' });
  state = analyzeAndUpdateSalesState(state, history);
  assert(state.customer.email === 'jordan@northstar.com', 'Captured Email from speech: jordan@northstar.com');
  assert(state.nextQuestion?.field !== 'email', 'Next question is NOT email again');

  // TEST 8: Real 46-turn transcript regression test
  console.log('\n[TEST 8] Real Customer Call Regression (Anti-Hallucination & Full Recovery)');
  const realCallHistory: ChatMessage[] = [
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

  const realState = analyzeAndUpdateSalesState(createInitialSalesState('test-real-call'), realCallHistory);
  assert(realState.customer.fullName === 'Yaduraj', `Real Caller Name is "Yaduraj" (Got: "${realState.customer.fullName}")`);
  assert(realState.customer.company === 'Voice Masters', `Real Company is "Voice Masters" (NOT Agora! Got: "${realState.customer.company}")`);
  assert(realState.customer.jobTitle === 'Manager', `Real Role is "Manager" (Got: "${realState.customer.jobTitle}")`);
  assert(realState.customer.email === 'yaduraj.sp@gmail.com', `Real Email is "yaduraj.sp@gmail.com" (Got: "${realState.customer.email}")`);
  assert(realState.customer.phone === '930-247-6791' || realState.customer.phone === '9302476791', `Real Phone is "930-247-6791" (Got: "${realState.customer.phone}")`);
  assert(realState.qualification.budget === '$10,000', `Real Budget is "$10,000" (Got: "${realState.qualification.budget}")`);
  assert(Boolean(realState.qualification.timeline?.includes('1 month') || realState.qualification.timeline?.includes('month')), `Real Timeline is "1 month" (Got: "${realState.qualification.timeline}")`);

  // Verify buildStructuredCrmPayload
  const payload = buildStructuredCrmPayload(realState);
  assert(payload.contact.firstName === 'Yaduraj', `CRM Payload First Name: "${payload.contact.firstName}"`);
  assert(payload.contact.company === 'Voice Masters', `CRM Payload Company: "${payload.contact.company}" (NEVER Agora)`);
  assert(payload.contact.email === 'yaduraj.sp@gmail.com', `CRM Payload Email: "${payload.contact.email}"`);
  assert(payload.contact.phone === '930-247-6791' || payload.contact.phone === '9302476791', `CRM Payload Phone: "${payload.contact.phone}"`);
  assert(payload.contact.jobTitle === 'Manager', `CRM Payload Role: "${payload.contact.jobTitle}"`);

  console.log('\n================================================================');
  console.log('  ALL ANTI-REPETITION & EXTRACTION TESTS PASSED! 🎉             ');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
