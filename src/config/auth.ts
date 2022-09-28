import { createPrivateKey, createHash, createPublicKey } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { jwtVerify } from "jose";
import {
  Client,
  ClientMetadata,
  Issuer,
  generators,
  IssuerMetadata,
} from "openid-client";
import asyncHandler from "../async-handler";

type AuthMiddlewareConfiguration = {
  clientId: string;
  privateKey: string;
  clientMetadata?: Partial<ClientMetadata>;
  redirectUri?: string;
  authorizeRedirectUri?: string;
  callbackRedirectUri?: string;
  identityVerificationPublicKey?: string;
} & (
  | {
      issuerMetadata: IssuerMetadata;
    }
  | {
      discoveryEndpoint: string;
      issuerMetadata?: Partial<IssuerMetadata>;
    }
);

type IdentityCheckCredential = {
  credentialSubject: {
    name: Array<any>,
    birthDate: Array<any>
  }
}

enum Claims {
  CoreIdentity = "https://vocab.account.gov.uk/v1/coreIdentityJWT"
}

type GovUkOneLoginUserInfo = {
  [Claims.CoreIdentity]: any
}

const STATE_COOKIE_NAME = "state";
const NONCE_COOKIE_NAME = "nonce";

function readPrivateKey(privateKey: string) {
  return createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    type: "pkcs8",
    format: "der",
  }).export({
    format: "jwk",
  }) as any;
}

function readPublicKey(publicKey: string) {
  const armouredKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
  return createPublicKey(armouredKey);
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
  const jwk = readPrivateKey(configuration.privateKey);
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
      scope: "openid email phone offline_access",
      state: hash(state),
      nonce: hash(nonce),
      vtr: `["P2.Cl.Cm"]`, //Q: Confirm if the order and case is important
      claims: JSON.stringify({"userinfo":{[Claims.CoreIdentity]:{"essential":true}}})
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
  router.get("/oauth/callback", asyncHandler(async (req: Request, res: Response, next: NextFunction) => {

    // Check for an error
    if (req.query["error"]) {
      throw new Error(
        `${req.query.error} - ${req.query.error_description}`
      );
    }

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
    // Note: This is an HTTP GET to https://oidc.integration.account.gov.uk/userinfo
    // with the "Authorization: Bearer ${accessToken}` header
    const userinfo = await client.userinfo<GovUkOneLoginUserInfo>(tokenSet.access_token);

    /*
    Example userinfo
    {
      sub: 'urn:fdc:gov.uk:2022:EULgSHCO71iLMwX8lUiHUqbONoUR_E46WCBpzhIrdTE',
      email_verified: true,
      phone_number_verified: true,
      phone_number: '+447012345678',
      'https://vocab.account.gov.uk/v1/coreIdentityJWT': 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1cm46ZmRjOmdvdi51azoyMDIyOkVVTGdTSENPNzFpTE13WDhsVWlIVXFiT05vVVJfRTQ2V0NCcHpoSXJkVEUiLCJuYmYiOjE2NjQzNTU1NjMsImlzcyI6ImlkZW50aXR5LmludGVncmF0aW9uLmFjY291bnQuZ292LnVrIiwidm90IjoiUDIiLCJleHAiOjE2NjQzNTczNjMsImlhdCI6MTY2NDM1NTU2MywidmMiOnsiY3JlZGVudGlhbFN1YmplY3QiOnsibmFtZSI6W3sidmFsaWRVbnRpbCI6bnVsbCwibmFtZVBhcnRzIjpbeyJ0eXBlIjoiR2l2ZW5OYW1lIiwidmFsdWUiOiJLZW5uZXRoIn0seyJ0eXBlIjoiRmFtaWx5TmFtZSIsInZhbHVlIjoiRGVjZXJxdWVpcmEifV0sInZhbGlkRnJvbSI6bnVsbH1dLCJiaXJ0aERhdGUiOlt7InZhbHVlIjoiMTk1OS0wOC0yMyJ9XX0sImNvbnRleHRMaXN0IjpudWxsLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRlbnRpdHlDaGVja0NyZWRlbnRpYWwiXX0sInZ0bSI6Imh0dHBzOlwvXC9vaWRjLmludGVncmF0aW9uLmFjY291bnQuZ292LnVrXC90cnVzdG1hcmsifQ.ph_03XfQ_3EZDUSd_kFHEwkazfYg6VbQJYMSkDwS7SqTDuJwV0QL-GnXihFyc1s9WOfIyeyDRDH6_bOJK5K3ag',
      email: 'user@example.com'
    }
    */

    let identityCheckCredential: IdentityCheckCredential | null = null;

    // The core identity claim is present.
    // If the core identity claim is not present GOV.UK One Login
    // was not able to prove your user’s identity or the claim
    // wasn't requested.
    if(Claims.CoreIdentity in userinfo){

      // Read the resulting core identity claim
      // See: https://auth-tech-docs.london.cloudapps.digital/integrate-with-integration-environment/process-identity-information/#process-your-user-s-identity-information
      const coreIdentityJWT = Reflect.get(userinfo, Claims.CoreIdentity);
      
      // Check the validity of the claim using the public key
      const publicKey = readPublicKey(configuration.identityVerificationPublicKey!);
      const { payload } = await jwtVerify(coreIdentityJWT, publicKey, {
        issuer: "identity.integration.account.gov.uk"
      });

      // Check the Vector of Trust (vot) to ensure the expected level of confidence was achieved.
      if(payload.vot !== "P2"){
        throw new Error("Expected level of confidence was not achieved.");
      }

      identityCheckCredential = payload.vc as IdentityCheckCredential;
    } 

    res.render("migrate.njk", {
      userinfo,
      identityCheckCredential,
    });

  }));

  return router;
}