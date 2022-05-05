# GOV.UK Sign In Relying Party Application

A NodeJS+TypeScript application using GOV.UK Sign In to authenticate users.
This is intended as a reference and doesn't represent production quality code.

## Development

```
npm run dev
```

## Docker Container

### Building the docker image

```
docker build -t gov-uk-sign-in-rp .
```

### Running the docker image

```
docker run -it --init -v ${PWD}/.keys:/app/.keys -e PRIVATE_KEY_FILE=/app/.keys/private_key.jwk -e CLIENT_ID=<YourClientID> -p 3000:8080 gov-uk-sign-in-rp
```
