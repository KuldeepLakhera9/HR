/**
 * PM2 Ecosystem Configuration for Non-Root / HPC Cluster Deployment
 * Runs 100% in user space without requiring root or Docker daemon.
 *
 * Usage:
 *   npx pm2 start ecosystem.config.js
 *   npx pm2 status
 *   npx pm2 logs
 *   npx pm2 restart ecosystem.config.js
 *   npx pm2 stop ecosystem.config.js
 */

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'hrms-api',
      cwd: path.resolve(__dirname, 'apps/api'),
      script: 'dist/main.js',
      instances: process.env.API_INSTANCES ? parseInt(process.env.API_INSTANCES, 10) : 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.API_PORT || 4000,
      },
      out_file: path.resolve(__dirname, 'logs/api-out.log'),
      error_file: path.resolve(__dirname, 'logs/api-error.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'hrms-web',
      cwd: path.resolve(__dirname, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${process.env.WEB_PORT || 8080}`,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.WEB_PORT || 8080,
      },
      out_file: path.resolve(__dirname, 'logs/web-out.log'),
      error_file: path.resolve(__dirname, 'logs/web-error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
