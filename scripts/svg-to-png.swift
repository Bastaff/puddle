import AppKit

let a = CommandLine.arguments
let dims = a.count == 4 ? a[3].split(separator: "x").compactMap { Int($0) } : []
guard dims.count == 1 || dims.count == 2, let image = NSImage(contentsOfFile: a[1]) else {
  FileHandle.standardError.write("usage: svg-to-png.swift in.svg out.png size|WIDTHxHEIGHT\n".data(using: .utf8)!); exit(1)
}
let (w, h) = (dims[0], dims.last!)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
image.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
