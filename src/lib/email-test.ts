import * as nodemailer from 'nodemailer';
import Imap from 'node-imap';

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

interface IMAPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: string;
}

export async function testSMTPConnection(config: SMTPConfig): Promise<ConnectionTestResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });

    // Verify connection
    await transporter.verify();
    
    // Close the connection
    transporter.close();
    
    return {
      success: true,
      details: 'SMTP connection successful'
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMTP connection failed',
      details: `Failed to connect to ${config.host}:${config.port}`
    };
  }
}

export async function testIMAPConnection(config: IMAPConfig): Promise<ConnectionTestResult> {
  return new Promise((resolve) => {
    try {
      const imap = new Imap({
        user: config.username,
        password: config.password,
        host: config.host,
        port: config.port,
        tls: config.secure,
        connTimeout: 10000,
        authTimeout: 10000,
      });

      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          try {
            imap.end();
          } catch {
            // Ignore cleanup errors
          }
        }
      };

      imap.once('ready', () => {
        cleanup();
        resolve({
          success: true,
          details: 'IMAP connection successful'
        });
      });

      imap.once('error', (err: Error) => {
        cleanup();
        resolve({
          success: false,
          error: err.message || 'IMAP connection failed',
          details: `Failed to connect to ${config.host}:${config.port}`
        });
      });

      imap.once('close', () => {
        if (!resolved) {
          cleanup();
          resolve({
            success: false,
            error: 'Connection closed unexpectedly',
            details: `Connection to ${config.host}:${config.port} was closed`
          });
        }
      });

      // Set a timeout as a fallback
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve({
            success: false,
            error: 'Connection timeout',
            details: `Timeout connecting to ${config.host}:${config.port}`
          });
        }
      }, 15000);

      imap.connect();
    } catch (error: unknown) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'IMAP connection failed',
        details: `Failed to connect to ${config.host}:${config.port}`
      });
    }
  });
}

export async function testBothConnections(
  smtpConfig: SMTPConfig,
  imapConfig: IMAPConfig
): Promise<{ smtp: ConnectionTestResult; imap: ConnectionTestResult }> {
  const [smtpResult, imapResult] = await Promise.all([
    testSMTPConnection(smtpConfig),
    testIMAPConnection(imapConfig)
  ]);

  return {
    smtp: smtpResult,
    imap: imapResult
  };
}