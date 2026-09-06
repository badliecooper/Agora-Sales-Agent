
async function performRealVoiceCallTest() {
  console.log('===========================================================');
  console.log('       PERFORMING REAL AGORA CALL & CRM SYNC TEST          ');
  console.log('===========================================================\n');

  // Step 1: Generate real Agora Token & Channel
  console.log('1. [AGORA] Generating real RTC/RTM token and channel...');
  const tokenRes = await fetch('http://localhost:3000/api/generate-agora-token');
  if (!tokenRes.ok) {
    throw new Error(`Failed to generate Agora token: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const agoraData = (await tokenRes.json()) as { uid: string; channel: string; token: string };
  console.log(`✓ Agora Token Generated | UID: ${agoraData.uid} | Channel: ${agoraData.channel}`);

  // Step 2: Invite Agora Agent
  console.log('\n2. [AGORA] Inviting AI Sales Agent into channel...');
  const inviteRes = await fetch('http://localhost:3000/api/invite-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requester_id: agoraData.uid,
      channel_name: agoraData.channel,
      companyId: 'default-company',
    }),
  });

  if (!inviteRes.ok) {
    throw new Error(`Failed to invite agent: ${inviteRes.status} ${await inviteRes.text()}`);
  }
  const agentData = (await inviteRes.json()) as { agent_id: string; state: string };
  console.log(`✓ AI Agent Started | Agent ID: ${agentData.agent_id} | State: ${agentData.state}`);

  // Step 3: Simulate Conversation Turn (Exact user prompt scenario)
  console.log('\n3. [CONVERSATION] Simulating Customer Speech in Call...');
  const userSpeech =
    "Hi, I'm John from Acme. We're looking for an AI voice agent for customer support. We have around 50 support agents and want to deploy within two months. We are interested in Agora's Conversational AI platform. Can you arrange a demo?";
  console.log(`Customer: "${userSpeech}"`);

  const transcript = [
    {
      role: 'assistant',
      content: "Hi there! I'm Ada from Agora. Tell me about the voice agent project you're building!",
    },
    {
      role: 'user',
      content: userSpeech,
    },
    {
      role: 'assistant',
      content: "Hi John, fantastic to meet you! Agora's Conversational AI platform is built specifically for real-time customer support at scale. I'd be delighted to arrange a technical demo for Acme.",
    },
  ];

  // Step 4: Stop Conversation / Call Ends
  console.log('\n4. [CALL END] User clicks "End Conversation" — stopping Agora agent...');
  const stopRes = await fetch('http://localhost:3000/api/stop-conversation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentData.agent_id,
      channel_name: agoraData.channel,
    }),
  });
  console.log(`✓ Stop Agent Response: ${stopRes.status} ${stopRes.statusText}`);

  // Step 5: Post-Call Asynchronous CRM Sync
  console.log('\n5. [CRM SYNC] Triggering POST /api/crm/sync-lead with final transcript...');
  const syncRes = await fetch('http://localhost:3000/api/crm/sync-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: agoraData.channel,
      companyId: 'default-company',
      transcript,
    }),
  });

  const syncData = await syncRes.json();
  console.log('\n6. [CRM RESULT] Response from /api/crm/sync-lead:');
  console.log(JSON.stringify(syncData, null, 2));

  console.log('\n===========================================================');
  console.log('             TEST FLOW EXECUTION COMPLETED                 ');
  console.log('===========================================================');
}

performRealVoiceCallTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
