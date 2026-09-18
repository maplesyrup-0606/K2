"""SMTP email sending, shared by the auth blueprint (verification/reset
links) and the admin blueprint (invites, until that's removed). Extracted
verbatim from routes_admin.py's former _send_email — no behavior change.

send_email() is called synchronously from request handlers (signup, login,
forgot-password, resend-verification) and the app runs a single gunicorn
worker (-w 1, see Dockerfile) — a slow/unreachable SMTP server blocks the
entire app for every user, bounded to ~10s by the timeout below. Known,
accepted tradeoff for now; see memory project_auth_overhaul_followups."""
import os
import smtplib
from email.mime.text import MIMEText

GMAIL_FROM = os.getenv('GMAIL_FROM', 'mercurymcindoe@gmail.com')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')


def send_email(to_email, subject, html):
    password = os.getenv('GMAIL_APP_PASSWORD')
    if not password:
        print(f'[email] skipped — GMAIL_APP_PASSWORD not set')
        return
    msg = MIMEText(html, 'html')
    msg['Subject'] = subject
    msg['From'] = f'K2 <{GMAIL_FROM}>'
    msg['To'] = to_email
    try:
        with smtplib.SMTP('smtp.gmail.com', 587, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(GMAIL_FROM, password)
            smtp.sendmail(GMAIL_FROM, to_email, msg.as_string())
        print(f'[email] "{subject}" sent to {to_email}')
    except Exception as e:
        print(f'[email] failed to send to {to_email}: {e}')


def _branded(body_html):
    return f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0a09;color:#f5f5f4;border-radius:12px;">
      <h1 style="font-size:48px;font-weight:800;color:#863bff;margin:0 0 8px;">K2</h1>
      <p style="color:#a8a29e;margin:0 0 24px;">Climbing log for friends</p>
      {body_html}
    </div>
    """


def _install_guide_block():
    return f"""
      <div style="margin:32px 0 0;padding-top:24px;border-top:1px solid #292524;">
        <p style="margin:0 0 16px;">Get the most out of K2 by installing it on your phone — it works like a real app, no App Store needed.</p>
        <a href="{FRONTEND_URL}/install" style="display:inline-block;background:#292524;color:#f5f5f4;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Install K2 &rarr;</a>
      </div>
    """


def send_verification_email(to_email, token):
    link = f"{FRONTEND_URL}/verify-email?token={token}"
    body = f"""
      <p style="margin:0 0 32px;">Confirm your email to finish setting up your K2 account. This link expires in 3 days.</p>
      <a href="{link}" style="display:inline-block;background:#863bff;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Verify email &rarr;</a>
      <p style="margin:32px 0 0;color:#78716c;font-size:13px;">Don't see this in your inbox? Check spam or junk.</p>
      {_install_guide_block()}
    """
    send_email(to_email, "Verify your K2 email", _branded(body))


def send_welcome_email(to_email):
    body = f"""
      <p style="margin:0 0 32px;">Welcome to K2! Your account is ready to go.</p>
      {_install_guide_block()}
    """
    send_email(to_email, "Welcome to K2", _branded(body))


def send_password_reset_email(to_email, token):
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    body = f"""
      <p style="margin:0 0 32px;">Reset your K2 password. This link expires in 1 hour.</p>
      <a href="{link}" style="display:inline-block;background:#863bff;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Reset password &rarr;</a>
      <p style="margin:32px 0 0;color:#78716c;font-size:13px;">Don't see this in your inbox? Check spam or junk.</p>
    """
    send_email(to_email, "Reset your K2 password", _branded(body))
