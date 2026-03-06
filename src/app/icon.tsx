import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: '#1e293b', // slate-800
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '40px',
                }}
            >
                <span style={{ fontSize: 96, color: '#3b82f6', fontWeight: 'bold' }}>FC</span>
            </div>
        ),
        { ...size }
    )
}
