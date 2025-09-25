import '../src/server.js';

setTimeout(async () => {
  try {
    const health = await fetch('http://localhost:4000/health');
    console.log('HEALTH', await health.json());
    const stats = await fetch('http://localhost:4000/stats');
    console.log('STATS', await stats.json());
  } catch (error) {
    console.error('FETCH_ERROR', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}, 1200);
