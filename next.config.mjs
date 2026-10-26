/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: '/bookmarks',
	// The Docker image runs .next/standalone/server.js (no node_modules, no sources in the runtime image).
	output: 'standalone',
	poweredByHeader: false,
	allowedDevOrigins: ['games.ideniox.com'],
	// The monitor is the only view.
	async redirects() {
		return [
			{ source: '/', destination: '/pages/monitor', permanent: false },
			{ source: '/', destination: '/bookmarks/pages/monitor', permanent: false, basePath: false },
		];
	},
};

export default nextConfig;
