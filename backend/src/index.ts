import express from 'express';
import  Service  from './service.js';
import pool from './db.js';

const app = express();
const port = 4000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});


app.post('/sync', async (req, res) => {  
  try {
    await Service.Weekly();
    res.send('Data sync completed successfully!');
  } catch (error) {   
    console.error('Error during sync:', error);
    res.status(500).send('Data sync failed. Check server logs for details.');
  }
});



function getWeeklyReposFromDB() {
  return pool.query('SELECT * FROM repository_stats WHERE type_name = $1', ['7d'])
    .then(result => result.rows)
    .catch(err => {
      console.error('Error fetching weekly repos from DB:', err);
      throw err;
    });
}

function getWeeklyReposWithDetailsFromDB() {
  const query = `
    SELECT r.*, s.stars_gained, s.type_name, s.measured_at
    FROM repositories r
    JOIN repository_stats s ON r.github_id = s.github_id
    WHERE s.type_name = $1
  `;

  return pool.query(query, ['7d'])
    .then(result => result.rows)
    .catch(err => {
      console.error('Error fetching weekly repos with details from DB:', err);
      throw err;
    });
} 

app.get('/weekly-ids', async (req, res) => {
  try {
    const repos = await getWeeklyReposFromDB();
    res.json(repos);
  } catch (error) {
    res.status(500).send('Failed to fetch weekly repositories. Check server logs for details.');
  }
});


app.get('/weekly', async (req, res) => {
  try {
    const repos = await getWeeklyReposWithDetailsFromDB();
    res.json(repos);
  } catch (error) {
    res.status(500).send('Failed to fetch weekly repositories. Check server logs for details.');
  }
} );