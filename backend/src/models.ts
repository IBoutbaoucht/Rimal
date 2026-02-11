export interface GitHubRepo {
  databaseId: number;
  name: string;
  nameWithOwner: string;

  owner: {
    login: string;
    avatarUrl: string;
    __typename: string;
  };

  description?: string;
  url: string;
  homepageUrl?: string;

  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  issues: { totalCount: number };
  diskUsage: number;
  primaryLanguage?: { name: string };
  repositoryTopics: {
    nodes: Array<{ topic: { name: string } }>;
  };
  languages: {
    edges: Array<{
      size: number;
      node: { name: string };
    }>;
    totalSize: number;
  };
  licenseInfo?: {
    name: string;
    key: string;
  };
  createdAt: string;
  updatedAt: string;
  pushedAt?: string;
  isFork: boolean;
  isArchived: boolean;
  isDisabled: boolean;
  forkingAllowed: boolean;
  isTemplate: boolean;
}