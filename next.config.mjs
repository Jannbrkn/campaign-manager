/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['mjml', 'exceljs'],
  },
}

export default nextConfig
