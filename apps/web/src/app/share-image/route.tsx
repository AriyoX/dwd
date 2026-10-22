import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#faf6f0',
        color: '#402936',
        padding: '64px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 720,
        }}
      >
        <div style={{ display: 'flex', fontSize: 42, fontWeight: 700, letterSpacing: '-4px' }}>
          dwd.
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 88,
            lineHeight: 1.05,
            letterSpacing: '-5px',
          }}
        >
          <span>Your night.</span>
          <span>Your own pace.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 23 }}>Drinks, chasers &amp; good company.</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 50,
          top: 62,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: '#e3b96a',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          marginTop: 70,
          width: 300,
          height: 355,
          padding: 30,
          background: '#402936',
          color: '#fffaf0',
          transform: 'rotate(8deg)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 16, letterSpacing: '3px' }}>TONIGHT, SO FAR.</div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 48, lineHeight: 1.15 }}>
          <span>Make it</span>
          <span>your own.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 17 }}>A count, never a competition.</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
