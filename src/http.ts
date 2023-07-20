//=============================================================================
// W2Wizard, Amsterdam @ 2018-2023
// See README and LICENSE files for details.
//=============================================================================

// World's first shittiest HTTP parser.
// Intended for use with the docker daemon only at this point.

/** The HTTP protocol version */
export type HTTPProtocol = "1.0" | "1.1";

//=============================================================================

/**
 * Parse the HTTP headers.
 * @param header
 * @returns
 */
function parseHTTPHeader(header: string): Headers {
	const headers = new Headers();
	const headerLines = header.split("\r\n");
	for (let i = 1; i < headerLines.length; i++) {
		const [key, value] = headerLines[i].split(": ");
		headers.set(key, value);
	}
	return headers;
}

/**
 * Parse the probably chunked HTTP body.
 *
 * @warning This function ONLY supports chunked encoding.
 *
 * @param headers The HTTP headers.
 * @param body The HTTP body (may be chunked only)
 * @returns The parsed HTTP body.
 */
function parseHTTPBody(headers: Headers, body: string): string {
	switch (headers.get("Transfer-Encoding")) {
		case "chunked": {
			const chunks = body.split("\r\n");
			const chunkData = chunks.filter((_, i) => i % 2 === 1);
			const chunkSizes = chunks.filter((_, i) => i % 2 === 0).map((chunk) => {
				return parseInt(chunk, 16);
			});

			// NOTE(W2): -1 because the last chunk is always 0
			// TODO: I don't handle trailers, so no idea if parsing will work.
			let bodyBuff: string = "";
			for (let i = 0; i < chunkSizes.length - 1; i++)
				bodyBuff += chunkData[i].substring(0, chunkSizes[i]);
			return bodyBuff;
		}
		case "deflate":
		case "gzip":
		case "compress":
			throw new Error("Compression not implemented.");
		default:
			return body; // If not encoded, just return the body
	}
}

//=============================================================================

/**
 * Parse a raw HTTP response into a Response object.
 * TODO: Add support for HTTP 1.0 (if needed)
 *
 * @note This function ONLY supports chunked encoding.
 * @expiremental This function hasn't been tested yet.
 *
 * @param buffer The raw HTTP response to parse.
 * @param protocol The HTTP protocol version.
 * @returns The parsed response.
 */
export function parseHTTPRaw(buffer: Buffer, protocol: HTTPProtocol): Response {
	const data = buffer.toString();
	const [headerRaw, bodyRaw] = data.split("\r\n\r\n");

	const statusLine = headerRaw.match(new RegExp(`HTTP\/1.1 (\\d+) (.+)`))!;
	if (!statusLine)
		throw new Error("Invalid status line received.");

	const [_, status, statusText] = statusLine;
	const headers = parseHTTPHeader(headerRaw);
	const body = parseHTTPBody(headers, bodyRaw);

	// TODO: Add support for trailers
	return new Response(body, {
		status: parseInt(status),
		statusText: statusText,
		headers: headers,
	});
}

/**
 * Get a string representation of a request.
 * @param request The request to get the string representation of.
 * @returns The string representation of the request.
 */
export function requestToString(request: Request, protocol: HTTPProtocol = "1.1") {
	const { method, url, headers } = request;

	let requestString = `${method} ${url} HTTP/${protocol}\r\n`;
	headers.forEach((value, key) => {
		requestString += `${key}: ${value}\r\n`;
	});

	requestString += '\r\n';
	return requestString;
}
