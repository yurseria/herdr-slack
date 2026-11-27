import {exec,appHome} from "herdr";
import * as fs from "fs/promises";
import {Buffer} from "buffer";
import {createHash} from "crypto";
import {imageSize} from "./image-size.js";

export const isImageFile=file=>/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|avif)$/i.test(file??'');
// Keep base64 below Herdr exec's 8 MiB output bound, including response overhead.
export const IMAGE_BYTES=5*1024*1024;
export const IMAGE_READ_PY=`
import base64, pathlib, sys
try:
    with pathlib.Path(sys.argv[1]).open("rb") as stream:
        data = stream.read(int(sys.argv[2]) + 1)
    if len(data) > int(sys.argv[2]):
        raise ValueError("Image preview is limited to 5 MiB.")
    if not data: raise ValueError("The image file is empty.")
    print(base64.b64encode(data).decode("ascii"))
except (OSError, ValueError) as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
`;
export async function loadPreviewImage(file,on) {
 const result=await exec("python3",["-c",IMAGE_READ_PY,file,String(IMAGE_BYTES)],{on});
 if(result.code!==0)throw new Error(result.stderr.trim()||"Could not read this image.");
 const encoded=result.stdout.trim();
 const id=createHash("sha1").update(encoded).digest("hex");
 const ext=file.split('.').at(-1).toLowerCase();
 const folder="data/chat-preview/images",rel=`${folder}/${id}.${ext}`,abs=`${appHome()}/${rel}`;
 await fs.mkdir(`${appHome()}/${folder}`,{recursive:true});
 await fs.writeFile(abs,Buffer.from(encoded,"base64"));
 const size=await imageSize(abs);
 return {rel,abs,w:size?.w??640,h:size?.h??480,title:file.split(/[\\/]/).at(-1)};
}
