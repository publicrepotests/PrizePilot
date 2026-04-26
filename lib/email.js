export async function sendPasswordResetEmail({ to, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return { sent: false, reason: "missing_resend_config" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: "Reset your PrizePilot password",
      html: `
        <p>We received a request to reset your PrizePilot password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires soon. If you did not request this, you can ignore this email.</p>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend email error: ${response.status} ${text}`);
  }

  return { sent: true };
}
