import { createPrivateKey, createHash } from "node:crypto";
import { Request, Response, Router } from "express";
import {
  Client,
  ClientMetadata,
  Issuer,
  generators,
  IssuerMetadata,
} from "openid-client";

type AuthMiddlewareConfiguration = {
  clientId: string;
  privateKey: string;
  clientMetadata?: Partial<ClientMetadata>;
  redirectUri?: string;
  authorizeRedirectUri?: string;
  callbackRedirectUri?: string;
} & (
  | {
      issuerMetadata: IssuerMetadata;
    }
  | {
      discoveryEndpoint: string;
      issuerMetadata?: Partial<IssuerMetadata>;
    }
);

const STATE_COOKIE_NAME = "state";
const NONCE_COOKIE_NAME = "nonce";

function parseJwk(privateKey: string) {
  return createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    type: "pkcs8",
    format: "der",
  }).export({
    format: "jwk",
  }) as any;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function getRedirectUri(req: Request) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers.host;
  return `${protocol}://${host}/oauth/callback`;
}

async function createIssuer(
  configuration: AuthMiddlewareConfiguration
): Promise<Issuer> {
  // Override issuer metadata if defined in configuration
  if ("discoveryEndpoint" in configuration) {
    let issuer = await Issuer.discover(configuration.discoveryEndpoint);
    const metadata = Object.assign(
      issuer.metadata,
      configuration.issuerMetadata
    );
    return new Issuer(metadata);
  }
  return new Issuer(configuration.issuerMetadata);
}

function createClient(
  configuration: AuthMiddlewareConfiguration,
  issuer: Issuer
): Client {
  // Override client metadata if defined in configuration
  const clientMetadata: ClientMetadata = Object.assign(
    {
      // Default configuration for using GOV.UK Sign In
      client_id: configuration.clientId,
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_signing_alg: "PS256",
      id_token_signed_response_alg: "ES256",
    },
    configuration.clientMetadata
  );

  // Private key is required for signing token exchange
  const jwk = parseJwk(configuration.privateKey);
  const client = new issuer.Client(clientMetadata, {
    keys: [jwk],
  });
  return client;
}

export async function auth(configuration: AuthMiddlewareConfiguration) {
  // Configuration for the authority that authenticates users and issues the tokens.
  const issuer = await createIssuer(configuration);

  // The client that requests the tokens.
  const client = createClient(configuration, issuer);

  const router = Router();

  // Construct the url and redirect on to the authorization endpoint
  router.get("/oauth/login", (req: Request, res: Response) => {
    const redirectUri =
      configuration.authorizeRedirectUri ||
      configuration.redirectUri ||
      getRedirectUri(req);
    const nonce = generators.nonce();
    const state = generators.state();
    const authorizationUrl = client.authorizationUrl({
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email phone",
      state: hash(state),
      nonce: hash(nonce),
    });
    // Store the nonce and state in a session cookie so it can be checked in callback
    res.cookie(NONCE_COOKIE_NAME, nonce, {
      httpOnly: true,
    });
    res.cookie(STATE_COOKIE_NAME, state, {
      httpOnly: true,
    });
    // Redirect to the authorization server
    res.redirect(authorizationUrl);
  });

  // Callback receives the code and state from the authorization server
  router.get("/oauth/callback", async (req: Request, res: Response) => {
    // Get all the parameters to pass to the token exchange endpoint
    const redirectUri =
      configuration.callbackRedirectUri ||
      configuration.redirectUri ||
      getRedirectUri(req);
    const params = client.callbackParams(req);
    const nonce = req.cookies[NONCE_COOKIE_NAME];
    const state = req.cookies[STATE_COOKIE_NAME];

    // Exchange the access code in the url parameters for an access token.
    // The access token is used to authenticate the call to get userinfo.
    const tokenSet = await client.callback(redirectUri, params, {
      state: hash(state),
      nonce: hash(nonce),
    });
    if (!tokenSet.access_token) {
      throw new Error("No access token received");
    }

    // Use the access token to authenticate the call to userinfo
    const userinfo = await client.userinfo(tokenSet.access_token);

    // Display the results from userinfo
    res.render("migrate.njk", userinfo);
  });

  return router;
}
