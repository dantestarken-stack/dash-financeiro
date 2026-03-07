import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'MINHAS FINANÇAS',
        short_name: 'Minhas Finanças',
        description: 'Sistema de gestão financeira pessoal e previsibilidade.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        icons: [
            {
                src: '/icon',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/apple-icon',
                sizes: '180x180',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    }
}
