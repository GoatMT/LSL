// Production Functions require Blaze. Keep local emulators/builds available,
// but do not deploy this backend while the project has a strict $0 budget.
console.error('Deployment stopped: Lantern Rush requires $0 hosting with no billing account. Firebase Cloud Functions require Blaze. Keep Live H2H disabled until the free backend replacement is ready. See LIVE-H2H-SETUP.md.');
process.exitCode = 1;
