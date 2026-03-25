import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    // Get first project and first user
    const { rows: projects } = await client.query('SELECT id FROM projects ORDER BY id LIMIT 1');
    const { rows: users } = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
    
    if (!projects.length || !users.length) {
      console.log('No projects or users found. Skipping seed.');
      return;
    }
    
    const projectId = projects[0].id;
    const userId = users[0].id;
    
    console.log(`Seeding sample documents for project ${projectId}...`);
    
    // Check if sample docs already exist
    const { rows: existing } = await client.query(
      `SELECT id FROM documents WHERE project_id = $1 AND file_url LIKE '/sample-plans/%' LIMIT 1`,
      [projectId]
    );
    
    if (existing.length > 0) {
      console.log('Sample documents already exist. Skipping.');
      return;
    }
    
    const docs = [
      {
        name: 'Ground Floor Plan',
        fileName: 'ground-floor-plan.pdf',
        mimeType: 'application/pdf',
        fileUrl: '/sample-plans/ground-floor-plan.pdf',
        folder: 'Architectural Plans',
        category: 'architectural',
        fileSize: 12000,
      },
      {
        name: 'Electrical Services Plan',
        fileName: 'electrical-plan.pdf',
        mimeType: 'application/pdf',
        fileUrl: '/sample-plans/electrical-plan.pdf',
        folder: 'Engineering Drawings',
        category: 'engineering',
        fileSize: 10000,
      },
      {
        name: 'Site Plan',
        fileName: 'site-plan.pdf',
        mimeType: 'application/pdf',
        fileUrl: '/sample-plans/site-plan.pdf',
        folder: 'Site Documentation',
        category: 'site',
        fileSize: 11000,
      },
    ];
    
    for (const doc of docs) {
      await client.query(
        `INSERT INTO documents (project_id, name, file_name, mime_type, file_url, folder, category, file_size, uploaded_by_id, included_in_inspection, created_at, updated_at, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW(), '{}')`,
        [projectId, doc.name, doc.fileName, doc.mimeType, doc.fileUrl, doc.folder, doc.category, doc.fileSize, userId]
      );
      console.log(`  ✓ Added: ${doc.name} (${doc.folder})`);
    }
    
    console.log('Sample documents seeded successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
