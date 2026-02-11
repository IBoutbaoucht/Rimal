declare class Service {
    private bigquery;
    private graphqlClient;
    constructor();
    Weekly(): Promise<void>;
    Monthly(): Promise<void>;
    Quarterly(): Promise<void>;
    /**
     * 1. Query BigQuery for "new and hot" repos (High stars, recent growth)
     * 2. Calls fetchDetailsAndSave to enrich and store them.
     */
    syncTrendsFromGHArchive(days: number, categoryTag: string): Promise<void>;
    /**
     * 1. Enriches the raw list with full metadata from GitHub GraphQL API.
     * 2. Saves the data to 'repositories' table.
     * 3. Saves the specific growth metrics to 'repository_stats' table.
     */
    private fetchDetailsAndSave;
    private enrichWithGraphQL;
    private batchInsertToTable;
    private sleep;
}
declare const _default: Service;
export default _default;
//# sourceMappingURL=service.d.ts.map