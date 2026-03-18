import nodemailer from "nodemailer";

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;

  if (smtpHost) {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || "noreply@diagramatix.com",
      to: email,
      subject: "Reset your Diagramatix password",
      html: `
        <p>You requested a password reset for your Diagramatix account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  } else {
    console.log("\n========================================");
    console.log("[PASSWORD RESET]");
    console.log(`Email: ${email}`);
    console.log(`Link:  ${resetUrl}`);
    console.log("========================================\n");
  }
}
