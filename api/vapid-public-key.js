// GET /api/vapid-public-key
// フロントエンドに VAPID 公開鍵を返す
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  res.status(200).json({ publicKey: key });
}
