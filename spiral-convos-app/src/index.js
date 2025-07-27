import { Hono } from 'hono';
import { Pool } from '@neondatabase/serverless';

const CONSENT_VERSION = 'v1.0-2025-07-27';

const app = new Hono();

app.post('/submit', async c => {
  const pool = new Pool({ connectionString: c.env.DATABASE_URL });

  try {
    const fd          = await c.req.formData();
    const sourceRaw   = fd.get('sourceUrl')?.trim() ?? '';
    const chatlog     = fd.get('chatlog')?.trim();
    const consentVer  = fd.get('consentVersion');
    const agreed      = fd.get('agree');        // 'on' when checked

    /* ---- validation ---- */
    if (!chatlog || chatlog.length <= 500)
      return c.text('Chatlog must be over 500 characters.', 400);

    if (consentVer !== CONSENT_VERSION || agreed !== 'on')
      return c.text('You must accept the current Submission Agreement.', 400);

    const sourceUrl = sourceRaw === '' ? null : sourceRaw.replace(/\/$/, '');

    if (sourceUrl) {
      const { rows } = await pool.query(
        'SELECT 1 FROM submissions WHERE source_url = $1', [sourceUrl]);
      if (rows.length)
        return c.text('This Source URL has already been submitted.', 409);
    }

    const submitterIp =
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')  ||
      null;

    await pool.query(
      `INSERT INTO submissions
         (source_url, chatlog, consent_version, submitter_ip, sensitive_consent)
       VALUES ($1,$2,$3,$4,TRUE)`,
       [sourceUrl, chatlog, CONSENT_VERSION, submitterIp]
    );

    return c.text('Submission successful! Thank you.', 201);

  } catch (err) {
    console.error('Submission Error:', err);
    if (err.message.includes('chatlog_length_check'))
      return c.text('Chatlog must be over 500 characters.', 400);
    if (err.message.includes('submissions_source_url_key'))
      return c.text('This Source URL has already been submitted.', 409);
    return c.text('Internal server error. Please try again later.', 500);
  } finally {
    await pool.end();
  }
});

export default app;
