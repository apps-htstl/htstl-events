// functions/src/notify.ts
// Cloud Function to generate secure QR tokens and dispatch ticket web links via email (Gmail/SendGrid/AWS SES) and SMS (Twilio/AWS SNS).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import sgMail from '@sendgrid/mail';
import { Twilio } from 'twilio';
import * as crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import * as nodemailer from 'nodemailer';
import { encryptToken } from './qr';

// Declare secrets for Firebase Secret Manager
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const SENDGRID_FROM_EMAIL = defineSecret('SENDGRID_FROM_EMAIL');
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const QR_ENCRYPTION_SECRET = defineSecret('QR_ENCRYPTION_SECRET');
const AWS_ACCESS_KEY_ID = defineSecret('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = defineSecret('AWS_SECRET_ACCESS_KEY');
const AWS_REGION = defineSecret('AWS_REGION');
const AWS_SES_FROM_EMAIL = defineSecret('AWS_SES_FROM_EMAIL');
const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

export const sendTickets = onCall(
  {
    secrets: [
      SENDGRID_API_KEY,
      SENDGRID_FROM_EMAIL,
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_FROM_NUMBER,
      QR_ENCRYPTION_SECRET,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
      AWS_SES_FROM_EMAIL,
      GMAIL_USER,
      GMAIL_APP_PASSWORD,
    ],
  },
  async (request) => {
    // 1. Authenticate Request
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to dispatch tickets.');
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    // Verify caller is an authorized user
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'Caller profile not found.');
    }
    const callerData = userSnap.data()!;
    if (
      callerData.role !== 'superadmin' &&
      callerData.role !== 'eventadmin' &&
      callerData.role !== 'volunteer'
    ) {
      throw new HttpsError('permission-denied', 'Only admins and authorized volunteers can dispatch tickets.');
    }

    // 2. Validate Parameters
    const { orgId, eventId, registrantIds, channel } = request.data as {
      orgId: string;
      eventId: string;
      registrantIds?: string[];
      channel: 'email' | 'sms' | 'both';
    };

    if (!orgId || !eventId || !channel) {
      throw new HttpsError('invalid-argument', 'Missing orgId, eventId, or channel parameter.');
    }

    // Verify Org access matches
    if (callerData.orgId !== orgId && callerData.role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Admin is not authorized for this organization.');
    }

    // 3. Fetch Event
    const eventSnap = await db.collection('orgs').doc(orgId).collection('events').doc(eventId).get();
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Event not found.');
    }
    const eventData = eventSnap.data()!;
    const eventName = eventData.name || 'HTSL Event';

    // 4. Query Registrations
    const regsRef = db.collection('orgs').doc(orgId).collection('events').doc(eventId).collection('registrations');
    let regsToProcess: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    if (registrantIds && registrantIds.length > 0) {
      // Fetch specific registrants in chunks of 30 (Firestore limit for in queries)
      const chunkSize = 30;
      for (let i = 0; i < registrantIds.length; i += chunkSize) {
        const chunk = registrantIds.slice(i, i + chunkSize);
        const chunkSnap = await regsRef.where('__name__', 'in', chunk).get();
        regsToProcess = [...regsToProcess, ...chunkSnap.docs];
      }
    } else {
      // Default: fetch all unsent registrants
      const unsentSnap = await regsRef.get();
      regsToProcess = unsentSnap.docs.filter((doc) => !doc.data().qrStatus?.sentAt);
    }

    if (regsToProcess.length === 0) {
      return { success: true, count: 0, message: 'No registrants found to dispatch tickets to.' };
    }

    // 5. Detect Active Providers via Environment Toggles (Feature Flags)
    const emailProvider = process.env.EXPO_PUBLIC_EMAIL_PROVIDER || 'sendgrid';
    const messagingProvider = process.env.EXPO_PUBLIC_MESSAGING_PROVIDER || 'twilio';

    const projectId = process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || 'regicheck';
    const encryptionSecret = QR_ENCRYPTION_SECRET.value();
    const baseTicketUrl = `https://${projectId}.web.app/ticket`;

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Initialize AWS SES & SNS clients if configured
    let sesClient: SESClient | null = null;
    let snsClient: SNSClient | null = null;

    const awsAccessKey = AWS_ACCESS_KEY_ID.value();
    const awsSecretKey = AWS_SECRET_ACCESS_KEY.value();
    const awsRegion = AWS_REGION.value();
    const awsSesFrom = AWS_SES_FROM_EMAIL.value();

    if (emailProvider === 'aws_ses') {
      sesClient = new SESClient({
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
        region: awsRegion,
      });
    }

    if (messagingProvider === 'aws_sns_sms') {
      snsClient = new SNSClient({
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
        region: awsRegion,
      });
    }

    // Initialize Gmail (Nodemailer) transporter if configured
    let gmailTransporter: nodemailer.Transporter | null = null;
    let gmailFrom = '';
    if (emailProvider === 'gmail') {
      const gmailUser = GMAIL_USER.value();
      const gmailPass = GMAIL_APP_PASSWORD.value();
      gmailFrom = gmailUser;
      gmailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });
    }

    // Initialize SendGrid client if configured
    let sendgridFrom = `tickets@${projectId}.firebaseapp.com`;
    if (emailProvider === 'sendgrid') {
      const sendgridKey = SENDGRID_API_KEY.value();
      sgMail.setApiKey(sendgridKey);
      try {
        sendgridFrom = SENDGRID_FROM_EMAIL.value() || sendgridFrom;
      } catch {
        // In case the secret isn't provisioned yet
      }
    }

    // Initialize Twilio client if configured
    let twilioClient: Twilio | null = null;
    let twilioFrom = '';
    if (messagingProvider === 'twilio') {
      const twilioSid = TWILIO_ACCOUNT_SID.value();
      const twilioToken = TWILIO_AUTH_TOKEN.value();
      twilioFrom = TWILIO_FROM_NUMBER.value();
      twilioClient = new Twilio(twilioSid, twilioToken);
    }

    // Process registrants
    for (const regDoc of regsToProcess) {
      const regId = regDoc.id;
      const regData = regDoc.data();
      const firstName = regData.firstName || '';
      const lastName = regData.lastName || '';
      const email = regData.email || '';
      const phone = regData.phone || '';
      const partySize = regData.partySize || 1;
      const tier = regData.tier || 'General';

      try {
        // A. Generate QR payload & encrypt
        const qrPayload = JSON.stringify({
          regId,
          eventId,
          partySize,
          tier,
          nonce: crypto.randomUUID(),
        });
        const encryptedToken = encryptToken(qrPayload, encryptionSecret);

        // B. Generate ticket web URL
        const ticketUrl = `${baseTicketUrl}/?orgId=${orgId}&eventId=${eventId}&regId=${regId}`;

        let emailSent = false;
        let smsSent = false;

        const emailSubject = `Your QR Ticket for ${eventName}`;
        const emailHtml = `
          <div style="font-family: sans-serif; padding: 24px; color: #111827; background-color: #F9FAFB;">
            <div style="max-width: 500px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <div style="background-color: #6D28D9; padding: 24px; text-align: center;">
                <h1 style="color: #FFFFFF; margin: 0; font-size: 20px;">Namaste, ${firstName}! 🙏</h1>
                <p style="color: #DDD6FE; margin: 4px 0 0 0; font-size: 14px;">Your event ticket is ready</p>
              </div>
              <div style="padding: 24px; gap: 12px;">
                <h2 style="margin-top: 0; font-size: 18px; color: #111827;">${eventName}</h2>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr style="border-bottom: 1px solid #F3F4F6;">
                    <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Guest Name</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 13px;">${firstName} ${lastName}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #F3F4F6;">
                    <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Party Size</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 13px;">${partySize} Guest(s)</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6B7280; font-size: 13px;">Seating Zone</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 13px; color: #6D28D9;">${tier}</td>
                  </tr>
                </table>
                
                <p style="font-size: 13px; color: #4B5563; line-height: 1.5; text-align: center;">
                  Tap the button below on your mobile device to view your personal entry QR Code. Show it to volunteers upon arrival:
                </p>
                
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${ticketUrl}" style="background-color: #6D28D9; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block;">
                    View Entry QR Code
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;

        // C. Send Email via Gmail, SendGrid, or AWS SES
        if ((channel === 'email' || channel === 'both') && email) {
          if (emailProvider === 'gmail' && gmailTransporter) {
            await gmailTransporter.sendMail({
              from: `"HTSL Registration Desk" <${gmailFrom}>`,
              to: email,
              subject: emailSubject,
              html: emailHtml,
            });
          } else if (emailProvider === 'aws_ses' && sesClient) {
            const command = new SendEmailCommand({
              Source: `"HTSL Registration Desk" <${awsSesFrom}>`,
              Destination: { ToAddresses: [email] },
              Message: {
                Subject: { Data: emailSubject, Charset: 'UTF-8' },
                Body: {
                  Html: { Data: emailHtml, Charset: 'UTF-8' },
                },
              },
            });
            await sesClient.send(command);
          } else {
            await sgMail.send({
              to: email,
              from: {
                email: sendgridFrom,
                name: 'HTSL Registration Desk',
              },
              subject: emailSubject,
              html: emailHtml,
            });
          }
          emailSent = true;
        }

        // D. Send SMS via Twilio or AWS SNS
        if ((channel === 'sms' || channel === 'both') && phone) {
          const smsText = `Namaste ${firstName}! 🙏\nYour ticket for ${eventName} is ready.\nParty size: ${partySize} (${tier}).\nTap to view your QR entry ticket: ${ticketUrl}`;

          if (messagingProvider === 'aws_sns_sms' && snsClient) {
            const command = new PublishCommand({
              Message: smsText,
              PhoneNumber: phone,
            });
            await snsClient.send(command);
          } else if (twilioClient) {
            await twilioClient.messages.create({
              body: smsText,
              from: twilioFrom,
              to: phone,
            });
          }
          smsSent = true;
        }

        // E. Save token and update status in Firestore
        const sentChannel = emailSent && smsSent ? 'both' : emailSent ? 'email' : 'sms';
        await regDoc.ref.update({
          qrToken: encryptedToken,
          qrStatus: {
            generated: true,
            sentAt: Timestamp.now(),
            channel: sentChannel,
          },
        });

        successCount++;
      } catch (err: any) {
        console.error(`Failed to process registration ${regId}:`, err);
        if (err.response && err.response.body && err.response.body.errors) {
          console.error('SendGrid error details:', JSON.stringify(err.response.body.errors));
        }
        failCount++;
        let errMsg = err?.message || 'Unknown error';
        if (err.response && err.response.body && err.response.body.errors) {
          const sgErrors = err.response.body.errors.map((e: any) => e.message).join(', ');
          errMsg += ` (SendGrid: ${sgErrors})`;
        } else if (err.$metadata) {
          errMsg += ` (AWS Code: ${err.name || 'Unknown'})`;
        }
        errors.push(`${firstName} ${lastName}: ${errMsg}`);
      }
    }

    return {
      success: failCount === 0,
      count: successCount,
      failed: failCount,
      errors,
    };
  }
);
