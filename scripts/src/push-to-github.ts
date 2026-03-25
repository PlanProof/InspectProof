import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { ReplitConnectors } from "@replit/connectors-sdk";

const REPO_NAME = "InspectProof";

interface GitHubUser {
  login: string;
  name: string;
}

interface GitHubRepo {
  clone_url: string;
  full_name: string;
  html_url: string;
}

interface GitHubConnectionSettings {
  access_token?: string;
  oauth?: {
    credentials?: {
      access_token?: string;
    };
  };
}

interface GitHubConnection {
  id: string;
  connectorName: string;
  settings: GitHubConnectionSettings;
}

function extractToken(settings: GitHubConnectionSettings): string {
  const token =
    settings.access_token ??
    settings.oauth?.credentials?.access_token;
  if (!token) {
    throw new Error(
      "Could not retrieve GitHub access token from connection settings.",
    );
  }
  return token;
}

async function findRepo(
  connectors: ReplitConnectors,
  login: string,
): Promise<GitHubRepo> {
  const resp = await connectors.proxy(
    "github",
    `/repos/${login}/${REPO_NAME}`,
    { method: "GET" },
  );
  if (resp.status === 200) {
    return resp.json() as Promise<GitHubRepo>;
  }

  const orgsResp = await connectors.proxy("github", "/user/orgs", {
    method: "GET",
  });
  const orgs = (await orgsResp.json()) as Array<{ login: string }>;

  for (const org of orgs) {
    const orgResp = await connectors.proxy(
      "github",
      `/repos/${org.login}/${REPO_NAME}`,
      { method: "GET" },
    );
    if (orgResp.status === 200) {
      return orgResp.json() as Promise<GitHubRepo>;
    }
  }

  throw new Error(
    `Repository "${REPO_NAME}" not found under user "${login}" or any of their organizations.`,
  );
}

async function pushToGitHub() {
  const connectors = new ReplitConnectors();

  console.log("Fetching GitHub credentials via Replit connector...");

  const userResp = await connectors.proxy("github", "/user", {
    method: "GET",
  });
  const user = (await userResp.json()) as GitHubUser;
  console.log(`Authenticated as: ${user.login}`);

  const connections = (await connectors.listConnections({
    connector_names: "github",
  })) as GitHubConnection[];

  const conn = connections[0];
  if (!conn) {
    throw new Error(
      "No GitHub connection found. Please connect your GitHub account via Replit integrations.",
    );
  }

  const token = extractToken(conn.settings);

  const repo = await findRepo(connectors, user.login);
  console.log(`Using repository: ${repo.full_name} (${repo.html_url})`);

  const credFile = "/tmp/git-credentials-push";
  writeFileSync(credFile, `https://${user.login}:${token}@github.com\n`, {
    mode: 0o600,
  });

  try {
    execSync(`git config credential.helper "store --file=${credFile}"`, {
      stdio: "inherit",
    });

    const remotes = execSync("git remote").toString().trim().split("\n");
    if (!remotes.includes("origin")) {
      execSync(`git remote add origin ${repo.clone_url}`, {
        stdio: "inherit",
      });
      console.log(`Added remote origin -> ${repo.clone_url}`);
    } else {
      execSync(`git remote set-url origin ${repo.clone_url}`, {
        stdio: "inherit",
      });
      console.log(`Updated remote origin -> ${repo.clone_url}`);
    }

    const currentBranch = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();
    console.log(`Pushing branch "${currentBranch}" to origin/main...`);
    execSync(`git push origin ${currentBranch}:main`, { stdio: "inherit" });
    console.log("Push complete.");
  } finally {
    unlinkSync(credFile);
  }
}

pushToGitHub().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
