const { initializeDatabase } = require('../config/database');

(async () => {
    console.log('Initializing database tables...');
    const success = await initializeDatabase();
    if (success) {
        console.log('✅ All tables created successfully!');
    } else {
        console.log('❌ Table creation failed. Check your database permissions and connection settings.');
    }
    process.exit();
})();
