// Placeholders: set the env vars and these start talking to the real services.
export async function createLead(payload) {
  if (!process.env.NAVIGATOR_CRM_URL) { console.log('[crm:mock] lead', payload); return { id: 'mock-' + Date.now() }; }
  const r = await fetch(process.env.NAVIGATOR_CRM_URL, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.NAVIGATOR_CRM_TOKEN },
    body: JSON.stringify(payload) });
  return r.json(); // TODO: adapt to the real Navigator CRM API
}
export async function notifyStaff(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return console.log('[telegram:mock]', text);
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
}

export async function sendVerificationEmail(email, code) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error('Brevo email configuration is missing');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        name: BREVO_SENDER_NAME || 'Academy',
        email: BREVO_SENDER_EMAIL
      },
      to: [{ email }],
      subject: 'Academy - Email Verification',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>Verify your email</h2>
          <p>Thank you for registering with Academy.</p>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing: 8px;">${code}</h1>
          <p>This code expires in 10 minutes.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[brevo:error]', response.status, error);
    throw new Error('Failed to send verification email');
  }
}
export async function sendStaffInvitationEmail(email, name, link) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error('Brevo email configuration is missing');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        name: BREVO_SENDER_NAME || 'Academy',
        email: BREVO_SENDER_EMAIL
      },
      to: [{ email }],
      subject: 'Academy - Staff Invitation',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>Welcome to Academy!</h2>
          <p>Hello ${name},</p>
          <p>You have been invited to join Academy as a staff member.</p>
          <p>Click below to set your password and activate your account.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">
            Set Your Password
          </a>
          <p>This invitation link expires in 3 days.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[brevo:error]', response.status, error);
    throw new Error('Failed to send staff invitation email');
  }
}