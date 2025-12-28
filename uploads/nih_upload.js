const { ImageUploadService } = require('node-upload-images');
const axios = require('axios');
const FormData = require('form-data');
require("../settings.js");

async function uploaderImg(buffer, fileName = null) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const finalFileName = fileName || `image_${timestamp}_${randomStr}.png`;
  
  try {
    const service = new ImageUploadService('pixhost.to');
    let { directLink } = await service.uploadFromBinary(buffer, finalFileName);
    
    if (!directLink) {
      throw new Error('No direct link received from pixhost.to');
    }

    return {
      status: true, 
      creator: global.creator,
      url: directLink,
      service: 'pixhost.to',
      timestamp: new Date().toISOString(),
      filename: finalFileName
    };
    
  } catch (error) {
    console.error('❌ pixhost.to upload failed:', error.message);
    
    return await uploadToTelegraPh(buffer, finalFileName);
  }
}

async function uploadToTelegraPh(buffer, fileName) {
  try {
    const form = new FormData();
    form.append('file', buffer, { filename: fileName });
    
    const response = await axios.post('https://telegra.ph/upload', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (response.data && response.data[0] && response.data[0].src) {
      const imageUrl = `https://telegra.ph${response.data[0].src}`;
      
      return {
        status: true,
        creator: global.creator,
        url: imageUrl,
        service: 'telegra.ph',
        timestamp: new Date().toISOString(),
        filename: fileName
      };
    }
    
    throw new Error('Invalid response from telegra.ph');
  } catch (error) {
    console.error('❌ telegra.ph upload failed:', error.message);
    
    return {
      status: false, 
      creator: global.creator,
      message: `Both services failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      services_tried: ['pixhost.to', 'telegra.ph'],
      filename: fileName
    };
  }
}

function generateFileName(originalName = null, prefix = 'image') {
  if (originalName) {
    return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
  
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const date = new Date();
  const dateStr = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear().toString().slice(-2)}`;
  
  return `${prefix}_${dateStr}_${timestamp}_${randomStr}.png`;
}

module.exports = { 
  uploaderImg,
  generateFileName 
};