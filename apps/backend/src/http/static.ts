import type http from "node:http";
import fs from "node:fs";
import path from "node:path";
import mime from "mime";

export function serveStatic(args: {
    request: http.IncomingMessage;
    response: http.ServerResponse;
    distRootAbsolutePath: string;
}): void {
    const url: string = args.request.url ?? "/";
    const cleanPath: string = url.split("?")[0] ?? "/";
    const requestedPath: string = cleanPath === "/" ? "/index.html" : cleanPath;

    const filePath: string = path.resolve(args.distRootAbsolutePath, "." + requestedPath);

    if (!filePath.startsWith(args.distRootAbsolutePath)) {
        args.response.writeHead(403);
        args.response.end("Forbidden");
        return;
    }

    try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            const indexPath: string = path.resolve(args.distRootAbsolutePath, "index.html");
            const html: Buffer = fs.readFileSync(indexPath);
            args.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            args.response.end(html);
            return;
        }

        const file: Buffer = fs.readFileSync(filePath);
        const contentType: string = mime.getType(filePath) ?? "application/octet-stream";
        args.response.writeHead(200, { "Content-Type": contentType });
        args.response.end(file);
    } catch {
        args.response.writeHead(500);
        args.response.end("Internal Server Error");
    }
}