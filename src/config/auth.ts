import assert from "node:assert";
import { Request, Response, Router } from "express";
import { ClientMetadata, Issuer, generators } from "openid-client";
import { readFile } from "node:fs/promises";

const DEFAULT_ISSUER_DISCOVERY_ENDPOINT =
  "https://oidc.integration.account.gov.uk/.well-known/openid-configuration";

async function readPrivateKey() {
  const privateKeyPath = process.env.PRIVATE_KEY_FILE;
  assert(privateKeyPath, "PRIVATE_KEY_FILE environment variable is not set");
  const jwk = await readFile(privateKeyPath, "utf-8");
  return JSON.parse(jwk);
}

function getRedirectUri(req: Request) {
  const redirectUri = process.env.REDIRECT_URI;
  if (redirectUri) {
    return redirectUri;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers.host;
  return `${protocol}://${host}/auth/callback`;
}

export async function auth() {
  const clientId = process.env.CLIENT_ID;
  assert(clientId, "CLIENT_ID environment variable is not set");
  const discoveryEndpoint =
    process.env.ISSUER_DISCOVERY_ENDPOINT || DEFAULT_ISSUER_DISCOVERY_ENDPOINT;

  const issuer = await Issuer.discover(discoveryEndpoint);

  const clientMetadata: ClientMetadata = {
    client_id: clientId,
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "PS256",
    id_token_signed_response_alg: "ES256",
  };

  const jwkKeySet = {
    keys: [await readPrivateKey()],
  };

  const client = new issuer.Client(clientMetadata, jwkKeySet);

  const router = Router();

  router.get("/auth/login", (req: Request, res: Response) => {
    // Build the URL for the authorization request
    const redirectUri = getRedirectUri(req);
    const nonce = generators.nonce();
    const authorizationUrl = client.authorizationUrl({
      response_type: "code",
      scope: "openid email phone",
      state: "state",
      redirect_uri: redirectUri,
      nonce,
    });
    // Store the nonce in a session cookie so it can be checked in callback
    res.cookie("nonce", nonce, {
      httpOnly: true,
    });
    // Redirect to the authorization server
    res.redirect(authorizationUrl);
  });

  router.get("/auth/callback", async (req: Request, res: Response) => {
    const redirectUri = getRedirectUri(req);
    const params = client.callbackParams(req);
    const nonce = req.cookies.nonce;
    const tokenSet = await client.callback(redirectUri, params, {
      state: "state",
      nonce: nonce,
    });
    if (!tokenSet.access_token) {
      throw new Error("No access token received");
    }
    const userinfo = await client.userinfo(tokenSet.access_token);

    console.log(userinfo);

    res.render("migrate.njk", userinfo);
  });

  return router;
}
