import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import SentEmail from '@/models/SentEmail';
import ReceivedEmail from '@/models/ReceivedEmail';
import connectDB from '@/lib/mongodb';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { originalEmailId, to, subject, content, inReplyTo, threadId } = body;

    // Validate required fields
    if (!to || !subject || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the original received email
    const originalEmail = await ReceivedEmail.findOne({
      _id: originalEmailId,
      userId: user._id
    }).populate('emailAccountId');

    if (!originalEmail) {
      return NextResponse.json({ error: 'Original email not found' }, { status: 404 });
    }

    const emailAccount = originalEmail.emailAccountId as any;
    if (!emailAccount) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    // Validate email account has SMTP settings
    if (!emailAccount.smtpHost || !emailAccount.smtpPassword) {
      return NextResponse.json({ error: 'Email account missing SMTP configuration' }, { status: 400 });
    }

    // Send email via SMTP
    console.log(`Sending reply via SMTP...`);
    console.log(`From: ${emailAccount.email} To: ${to}`);
    console.log(`SMTP Host: ${emailAccount.smtpHost}:${emailAccount.smtpPort}`);

    try {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: emailAccount.smtpHost,
        port: emailAccount.smtpPort,
        secure: emailAccount.smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: emailAccount.email,
          pass: emailAccount.smtpPassword,
        },
      });

      // Prepare email options
      const mailOptions = {
        from: `${emailAccount.fromName || emailAccount.email} <${emailAccount.email}>`,
        to: to,
        subject: subject,
        text: content,
        headers: {} as any,
      };

      // Add threading headers if this is a reply
      if (inReplyTo) {
        mailOptions.headers['In-Reply-To'] = inReplyTo;
        mailOptions.headers['References'] = inReplyTo;
      }

      // Send email
      const info = await transporter.sendMail(mailOptions);
      const messageId = info.messageId;

      console.log(`✅ Email sent successfully! Message ID: ${messageId}`);

      // Create sent email record with actual message ID
      const sentEmail = new SentEmail({
        userId: user._id,
        emailAccountId: emailAccount._id,
        contactId: originalEmail.contactId,
        campaignId: originalEmail.campaignId,
        from: emailAccount.email,
        to: to,
        subject: subject,
        content: content,
        messageId: messageId,
        threadId: threadId || inReplyTo,
        inReplyTo: inReplyTo,
        status: 'sent',
        sentAt: new Date(),
        wasAiGenerated: false,
        aiGeneratedSubject: false,
        aiGeneratedContent: false,
        opened: false,
        clicked: false,
      });

      await sentEmail.save();

      // Update the original received email to mark as replied
      await ReceivedEmail.updateOne(
        { _id: originalEmailId },
        { $set: { isRepliedTo: true } }
      );

      return NextResponse.json({
        message: 'Reply sent successfully',
        sentEmail: {
          _id: sentEmail._id,
          from: sentEmail.from,
          to: sentEmail.to,
          subject: sentEmail.subject,
          sentAt: sentEmail.sentAt,
          messageId: messageId,
        }
      }, { status: 201 });
    } catch (smtpError: any) {
      console.error('SMTP sending failed:', smtpError);

      // Save as failed email
      const sentEmail = new SentEmail({
        userId: user._id,
        emailAccountId: emailAccount._id,
        contactId: originalEmail.contactId,
        campaignId: originalEmail.campaignId,
        from: emailAccount.email,
        to: to,
        subject: subject,
        content: content,
        messageId: null,
        threadId: threadId || inReplyTo,
        inReplyTo: inReplyTo,
        status: 'failed',
        sentAt: new Date(),
        wasAiGenerated: false,
        aiGeneratedSubject: false,
        aiGeneratedContent: false,
        opened: false,
        clicked: false,
      });

      await sentEmail.save();

      return NextResponse.json({
        error: 'Failed to send email via SMTP',
        details: smtpError.message
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Send reply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
