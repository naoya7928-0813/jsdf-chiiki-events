import { Component } from 'react';

/**
 * アプリ全体のエラーバウンダリ。
 * イベントカード等の描画中に予期しないエラーが起きても
 * 白画面にせず、復帰用のフォールバックUIを表示する。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // 調査用にコンソールへ出力（本番でも収集はせず表示のみ）
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    // データ起因の描画エラーに備え、リロードで最新データから再構築する
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg, #f5f6f8)', color: 'var(--text, #1a2433)',
        padding: 24, textAlign: 'center',
        fontFamily: '"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif',
      }}>
        <div style={{ fontSize: 40 }} aria-hidden="true">⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>表示中に問題が発生しました</div>
        <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.7 }}>
          ご不便をおかけしています。<br />
          再読み込みすると直ることがあります。
        </div>
        <button
          onClick={this.handleReload}
          style={{
            marginTop: 8, padding: '10px 28px', fontSize: 14, fontWeight: 700,
            color: '#fff', background: '#0b2545', border: 'none',
            borderRadius: 22, cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      </div>
    );
  }
}
