import { BigQuery } from '@google-cloud/bigquery';
import { GraphQLClient, gql } from 'graphql-request';
import pool from './db.js';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
class Service {
    constructor() {
        this.bigquery = null;
        const token = process.env.GITHUB_TOKEN;
        if (!token)
            throw new Error('GITHUB_TOKEN is not set.');
        this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            try {
                this.bigquery = new BigQuery();
            }
            catch (e) {
                console.error("⚠️ Failed to initialize BigQuery.", e);
            }
        }
    }
    // ===========================================================================
    // PUBLIC SYNC METHODS
    // ===========================================================================
    async Weekly() {
        await this.syncTrendsFromGHArchive(7, '7d');
    }
    async Monthly() {
        await this.syncTrendsFromGHArchive(30, '30d');
    }
    async Quarterly() {
        await this.syncTrendsFromGHArchive(90, '90d');
    }
    // ===========================================================================
    // CORE LOGIC: BIGQUERY -> GRAPHQL -> DB
    // ===========================================================================
    /**
     * 1. Query BigQuery for "new and hot" repos (High stars, recent growth)
     * 2. Calls fetchDetailsAndSave to enrich and store them.
     */
    async syncTrendsFromGHArchive(days, categoryTag) {
        if (!this.bigquery) {
            console.error("❌ BigQuery client not initialized. Check credentials.");
            return;
        }
        console.log(`🔥 [GH Archive] Querying BigQuery for ${days}-day trends...`);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        // Format: YYMMDD (Matches table suffix day.20YYMMDD)
        const startSuffix = startDate.toISOString().split('T')[0].replace(/-/g, '').slice(2);
        const endSuffix = endDate.toISOString().split('T')[0].replace(/-/g, '').slice(2);
        // SQL: Find repos with most WatchEvents (Stars) in range
        const query = `
      SELECT
        repo.name as full_name,
        COUNT(*) as star_count
      FROM \`githubarchive.day.20*\`
      WHERE
        _TABLE_SUFFIX BETWEEN @startSuffix AND @endSuffix
        AND type = 'WatchEvent'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 3
    `;
        try {
            const [job] = await this.bigquery.createQueryJob({ query, params: { startSuffix, endSuffix } });
            const [rows] = await job.getQueryResults();
            console.log(`   ✅ [GH Archive] Found ${rows.length} trending repos.`);
            if (rows.length === 0)
                return;
            // Map BigQuery results to a temporary array
            // We store 'star_count' as 'growthCount' to distinguish it from total stars
            const rawRepos = rows.map((row) => ({
                full_name: row.full_name,
                growthCount: row.star_count
            }));
            await this.fetchDetailsAndSave(rawRepos, categoryTag);
        }
        catch (error) {
            console.error("❌ [GH Archive] Failed:", error.message);
        }
    }
    /**
     * 1. Enriches the raw list with full metadata from GitHub GraphQL API.
     * 2. Saves the data to 'repositories' table.
     * 3. Saves the specific growth metrics to 'repository_stats' table.
     */
    async fetchDetailsAndSave(rawRepos, category) {
        console.log(`   ✨ Enriching ${rawRepos.length} repos...`);
        // Create a Map for O(1) lookup of growth stats: 'owner/name' -> growthCount
        const growthMap = new Map();
        rawRepos.forEach(r => growthMap.set(r.full_name, r.growthCount));
        // 1. Get full details from GraphQL
        const detailedRepos = await this.enrichWithGraphQL(rawRepos);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            console.log(`    Clearing '${category}' tag...`);
            await client.query(`DELETE FROM repository_stats WHERE type_name = $1`, [category]);
            console.log(`   Upserting ${detailedRepos.length} records...`);
            // 2. Save Repo Data
            await this.batchInsertToTable(client, detailedRepos, growthMap, category);
            await client.query('COMMIT');
            console.log(`   ✅ Synced ${category} successfully.`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    // ===========================================================================
    // PRIVATE HELPER METHODS
    // ===========================================================================
    async enrichWithGraphQL(simpleRepos) {
        const query = gql `
      query FetchRepo($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          databaseId, name, nameWithOwner, owner { login, avatarUrl, __typename }, description, url, homepageUrl,
          stargazerCount, forkCount, watchers { totalCount }, issues(states: OPEN) { totalCount },
          diskUsage, primaryLanguage { name },
          repositoryTopics(first: 10) { nodes { topic { name } } },
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size, node { name } }, totalSize },
          licenseInfo { name, key }, createdAt, updatedAt, pushedAt,
          isFork, isArchived, isDisabled, forkingAllowed, isTemplate,
        }
      }
    `;
        let allRepos = [];
        for (const repo of simpleRepos) {
            try {
                const fullName = repo.full_name;
                if (!fullName || !fullName.includes('/'))
                    continue;
                const [owner, name] = fullName.split('/');
                const res = await this.graphqlClient.request(query, { owner, name });
                if (res.repository && res.repository.databaseId) {
                    allRepos.push(res.repository);
                }
                await this.sleep(200);
            }
            catch (error) {
                console.warn(`   ⚠️ Enrichment skipped for ${repo.full_name}`);
            }
        }
        return allRepos;
    }
    async batchInsertToTable(client, repos, growthMap, category) {
        for (const repo of repos) {
            const topics = repo.repositoryTopics?.nodes?.map(t => t.topic.name) || [];
            const growthCount = growthMap.get(repo.nameWithOwner) || 0;
            // 1. Insert Repository
            await client.query(`
        INSERT INTO repositories (
            github_id, name, full_name, owner_login, owner_avatar_url, description,
            html_url, homepage_url, stars_count, forks_count, watchers_count,
            open_issues_count, size_kb,language, topics, license_name,
            created_at, updated_at, pushed_at, is_fork, is_archived,
            is_disabled, allow_forking, is_template
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (github_id) DO UPDATE SET
            name = EXCLUDED.name,
            full_name = EXCLUDED.full_name,
            owner_login = EXCLUDED.owner_login,
            owner_avatar_url = EXCLUDED.owner_avatar_url,
            description = EXCLUDED.description,
            html_url = EXCLUDED.html_url,
            homepage_url = EXCLUDED.homepage_url,
            stars_count = EXCLUDED.stars_count,
            forks_count = EXCLUDED.forks_count,
            watchers_count = EXCLUDED.watchers_count,
            open_issues_count = EXCLUDED.open_issues_count,
            size_kb = EXCLUDED.size_kb,
            language = EXCLUDED.language,
            topics = EXCLUDED.topics,
            license_name = EXCLUDED.license_name,
            updated_at = EXCLUDED.updated_at,
            pushed_at = EXCLUDED.pushed_at,
            is_fork = EXCLUDED.is_fork,
            is_archived = EXCLUDED.is_archived,
            is_disabled = EXCLUDED.is_disabled,
            allow_forking = EXCLUDED.allow_forking,
            is_template = EXCLUDED.is_template
        `, [
                repo.databaseId,
                repo.name,
                repo.nameWithOwner,
                repo.owner.login,
                repo.owner.avatarUrl,
                repo.description,
                repo.url,
                repo.homepageUrl,
                repo.stargazerCount,
                repo.forkCount,
                repo.watchers?.totalCount || 0,
                repo.issues?.totalCount || 0,
                repo.diskUsage || 0,
                repo.primaryLanguage?.name,
                topics,
                repo.licenseInfo?.name,
                repo.createdAt,
                repo.updatedAt,
                repo.pushedAt,
                repo.isFork,
                repo.isArchived,
                repo.isDisabled,
                repo.forkingAllowed,
                repo.isTemplate
            ]);
            // 3. Insert Types & Growth Stats
            await client.query(`
          INSERT INTO repository_stats (github_id, type_name, stars_gained, measured_at)
          VALUES ($1, $2, $3, NOW())
          `, [repo.databaseId, category, growthCount]);
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
export default new Service();
//# sourceMappingURL=service.js.map