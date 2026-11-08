// Stands in for Cloudflare's built-in "cloudflare:workers" module when the tests run in Node.
// The OAuth library only checks whether a handler is a class built on WorkerEntrypoint.
export class WorkerEntrypoint {}
