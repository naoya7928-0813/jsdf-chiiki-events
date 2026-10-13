// 運営画面: イベントの開催状況（中止・延期・受付終了）と変更のお知らせ。
// イベント編集フォームの中に置く（手動イベント・自動収集イベントの両方）。
// 保存先・権限判定は /api/admin/event-changes（サーバー側）。ここは入力と表示だけ。
import { useState, useEffect, useCallback } from 'react';
import { F } from './Shared';
import { CHANGE_TYPES, CHANGE_TYPE_IDS, STATUS_LABELS, LIMITS, describeBefore } from '../../shared/eventChanges.cjs';

const STATUS_COLOR = { published: '#16a34a', closed: '#b45309', cancelled: '#dc2626', postponed: '#7c3aed', draft: '#888' };
const CONF_LABEL = { high: '高', medium: '中', low: '低' };

function fmt(iso) {
  try { return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso || ''; }
}

const EMPTY = { type: 'cancelled', reason: '', before: '', after: '', public: true, notify: false, evidence: '', confirmed: false, applyOn: false, date: '', endDate: '', time: '', place: '', address: '' };

export default function EventChangesPanel({ eventId, adminFetch, primary, canPublish, onChanged, styles }) {
  const { input, label, hint } = styles;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/admin/event-changes?id=${encodeURIComponent(eventId)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) setData(j); else setData({ error: j.error || '読み込めませんでした' });
    } catch { setData({ error: '通信に失敗しました' }); }
  }, [adminFetch, eventId]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const def = CHANGE_TYPES[form.type];
  const changeType = (t) => setForm(f => ({
    ...EMPTY, type: t, public: f.public,
    before: describeBefore(t, data?.event),
    // 日時変更・会場変更は現在の値を初期値に（直すところだけ書き換えればよい）
    date: data?.event?.date || '', endDate: data?.event?.endDate || '', time: data?.event?.time || '',
    place: data?.event?.place || '', address: data?.event?.address || '',
  }));
  // 開いたときに「変更前」を現在の値で埋める
  useEffect(() => { if (open && data?.event && !form.before) changeType(form.type); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, data]);

  const canApply = form.type === 'datetime' || form.type === 'postponed' || form.type === 'venue';

  async function submit() {
    setMsg(null);
    const change = {
      type: form.type, reason: form.reason, before: form.before, after: form.after,
      public: form.public, notify: form.public && def.notify && form.notify,
      evidence: form.evidence, confirmed: form.confirmed,
    };
    if (canApply && form.applyOn) {
      change.apply = form.type === 'venue'
        ? { place: form.place, address: form.address }
        : { date: form.date, endDate: form.endDate, time: form.time };
    }
    if ((form.type === 'cancelled' || form.type === 'postponed') && !window.confirm(`このイベントを「${def.label}」として登録しますか？\n公開すると利用者の画面に表示されます。`)) return;
    setBusy(true);
    try {
      const r = await adminFetch('/api/admin/event-changes', { method: 'POST', body: JSON.stringify({ id: eventId, change }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        let text = `「${def.label}」を登録しました。`;
        if (j.notify) {
          text += j.notify.skipped ? '（同じ内容を24時間以内に通知済みのため通知は送っていません）'
            : j.notify.error ? '（通知の送信に失敗しました。変更は保存済みです。時間をおいて同じ内容で登録し直すと再送できます）'
            : j.notify.configured === false ? '（通知の設定が無いため送信できませんでした）'
            : `（お気に入り登録者 ${j.notify.watchers} 件中 ${j.notify.sent} 件へ通知しました）`;
        }
        setMsg({ type: 'ok', text });
        setForm(EMPTY); setOpen(false);
        await load(); onChanged?.();
      } else setMsg({ type: 'err', text: j.error || '登録に失敗しました。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }

  async function toggleVisibility(c) {
    setBusy(true);
    try {
      const r = await adminFetch('/api/admin/event-changes', { method: 'PATCH', body: JSON.stringify({ id: eventId, changeId: c.id, public: !c.public }) });
      if (r.ok) { await load(); onChanged?.(); } else setMsg({ type: 'err', text: '切り替えに失敗しました。' });
    } finally { setBusy(false); }
  }
  async function remove(c) {
    if (!window.confirm('この変更記録を取り消しますか？（開催状況は変わりません。戻す場合は「開催予定に戻す」を登録してください）')) return;
    setBusy(true);
    try {
      const r = await adminFetch('/api/admin/event-changes', { method: 'DELETE', body: JSON.stringify({ id: eventId, changeId: c.id }) });
      if (r.ok) { await load(); onChanged?.(); } else setMsg({ type: 'err', text: '取り消しに失敗しました。' });
    } finally { setBusy(false); }
  }

  if (!data) return <div style={{ ...hint, margin: '0 0 14px' }}>開催状況を読み込み中…</div>;
  if (data.error) return <div style={{ ...hint, margin: '0 0 14px', color: '#ef4444' }}>開催状況: {data.error}</div>;

  const st = data.status || 'published';
  const chip = (text, color) => <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: color, borderRadius: 5, padding: '2px 7px' }}>{text}</span>;
  const btn = (c) => ({ fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '6px 10px', color: c, background: 'transparent', border: `1px solid ${c}66` });

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>現在の開催状況:</span>
        {chip(STATUS_LABELS[st] || st, STATUS_COLOR[st] || '#888')}
      </div>

      {data.auto && data.auto.status !== 'published' && (
        <div style={{ ...hint, margin: '0 0 10px', padding: '8px 10px', borderRadius: 8, background: 'var(--tag-bg)' }}>
          自動判定: <strong>{STATUS_LABELS[data.auto.status] || data.auto.status}</strong>
          {data.auto.reason ? `（${data.auto.reason}）` : ''}
          {data.auto.confidence ? ` 確信度: ${CONF_LABEL[data.auto.confidence] || data.auto.confidence}` : ''}
          {data.auto.evidence && <><br />根拠: 「{data.auto.evidence}」</>}
          <br />公式ページで確認し、誤りなら下で「開催予定に戻す」を登録してください。
        </div>
      )}

      {data.changes.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
          {data.changes.map((c, i) => (
            <div key={c.id} style={{ padding: '9px 11px', borderTop: i ? '1px solid var(--sep)' : 'none', fontSize: 12, lineHeight: 1.65, color: 'var(--text)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{CHANGE_TYPES[c.type]?.label || c.type}</strong>
                {chip(c.public ? '公開中' : '非公開', c.public ? '#16a34a' : '#888')}
                {c.notifiedAt && chip('通知済み', '#2563eb')}
                <span style={{ color: 'var(--text-muted)', fontFamily: F.mono, fontSize: 11 }}>{fmt(c.at)} {c.by}</span>
              </div>
              {(c.before || c.after) && <div>{c.before || '—'} → <strong>{c.after || '—'}</strong></div>}
              {c.reason && <div style={{ color: 'var(--text-sub)' }}>理由: {c.reason}</div>}
              {c.evidence && <div style={{ color: 'var(--text-muted)' }}>根拠: {c.evidence}{c.confirmed ? '（確認済み）' : ''}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="button" disabled={busy} onClick={() => toggleVisibility(c)} style={btn(primary)}>{c.public ? '非公開にする' : '公開する'}</button>
                <button type="button" disabled={busy} onClick={() => remove(c)} style={btn('#ef4444')}>取り消す</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <div style={{ padding: '8px 11px', borderRadius: 8, margin: '0 0 10px', fontSize: 12, lineHeight: 1.6, background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{ width: '100%', padding: 11, borderRadius: 10, marginBottom: 12, cursor: 'pointer', background: 'transparent', border: `1px dashed ${primary}`, color: 'var(--brand-fg)', fontSize: 13, fontWeight: 700 }}>
          ＋ 変更・中止を登録
        </button>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={label}>変更種別</div>
          <select value={form.type} onChange={e => changeType(e.target.value)} style={input}>
            {CHANGE_TYPE_IDS.filter(t => t !== 'resumed' || canPublish).map(t => <option key={t} value={t}>{CHANGE_TYPES[t].label}</option>)}
          </select>
          <div style={hint}>
            中止・延期・受付終了・開催予定に戻す は開催状況も切り替わります。日時変更・会場変更・内容変更・重要なお知らせは開催状況を変えません。
          </div>

          <div style={label}>変更理由{(form.type === 'cancelled' || form.type === 'postponed') ? ' *' : ''}</div>
          <input value={form.reason} maxLength={LIMITS.reason} onChange={e => set('reason', e.target.value)} placeholder="例: 台風接近のため" style={input} />

          <div style={label}>変更前の内容</div>
          <input value={form.before} maxLength={LIMITS.before} onChange={e => set('before', e.target.value)} placeholder="例: 2026-10-19 10:00～15:00" style={input} />

          <div style={label}>変更後の内容{['datetime', 'venue', 'content', 'notice'].includes(form.type) ? ' *' : ''}</div>
          <input value={form.after} maxLength={LIMITS.after} onChange={e => set('after', e.target.value)} placeholder={form.type === 'postponed' ? '例: 新しい日程は決まり次第お知らせします' : '例: 2026-10-26 10:00～15:00'} style={input} />

          {canApply && (
            <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>
                <input type="checkbox" checked={form.applyOn} onChange={e => set('applyOn', e.target.checked)} />
                イベントの{form.type === 'venue' ? '会場' : '日時'}表示も変更後の値にする
              </label>
              {form.applyOn && (form.type === 'venue' ? (
                <>
                  <input value={form.place} onChange={e => set('place', e.target.value)} placeholder="新しい会場名" style={input} />
                  <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="新しい住所" style={input} />
                </>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={{ ...input, flex: '1 1 140px' }} />
                  <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={{ ...input, flex: '1 1 140px' }} title="終了日（連日開催のみ）" />
                  <input value={form.time} onChange={e => set('time', e.target.value)} placeholder="10:00～15:00" style={{ ...input, flex: '1 1 140px' }} />
                </div>
              ))}
            </>
          )}

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>
            <input type="checkbox" checked={form.public} onChange={e => set('public', e.target.checked)} />
            利用者に公開する（イベント詳細・一覧に表示）
          </label>

          {def.notify && form.public && (
            <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>
                <input type="checkbox" checked={form.notify} onChange={e => set('notify', e.target.checked)} />
                お気に入り登録者へプッシュ通知する
              </label>
              {form.notify && (
                <>
                  <div style={label}>根拠（一次情報） *</div>
                  <input value={form.evidence} maxLength={LIMITS.evidence} onChange={e => set('evidence', e.target.value)} placeholder="例: 公式ページURL／主催者へ電話で確認" style={input} />
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>
                    <input type="checkbox" checked={form.confirmed} onChange={e => set('confirmed', e.target.checked)} />
                    一次情報で内容を確認済み
                  </label>
                  <div style={hint}>通知は取り消せません。同じ内容は24時間に1回までしか送りません。</div>
                </>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setOpen(false); setForm(EMPTY); }} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-sub)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>やめる</button>
            <button type="button" onClick={submit} disabled={busy} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: busy ? 'var(--border)' : primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>{busy ? '登録中…' : '登録する'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
