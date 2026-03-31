import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as mongoose from 'mongoose';
import { MONGODB_URI } from './load-env';

async function bootstrap() {
  const logger = new Logger('SeedSuperAdmin');
  
  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Подключение к MongoDB установлено');
    
    const userSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true, select: false },
      phoneAreaCode: { type: Number, required: true },
      phoneNumber: { type: Number, required: true },
      name: { type: String, required: true },
      language: { type: Object, default: { ru: 'Русский' } },
      additionalDocuments: { type: [String], default: [] },
      role: { 
        type: String, 
        required: true, 
        enum: ['superadmin', 'companyAdmin', 'projectAdmin', 'worker'],
        default: 'worker'
      },
      companyId: { type: String, default: null, ref: 'Company' },
      projectIds: { type: [String], default: [], ref: 'Project' },
    }, { timestamps: true });
    
    const User = mongoose.model('User', userSchema);
    
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' }).exec();
    
    if (existingSuperAdmin) {
      logger.log('SuperAdmin уже существует!');
      logger.log(`Email: ${existingSuperAdmin.email}`);
      logger.log('Если нужно создать нового, удалите существующего SuperAdmin или используйте другой email.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    const superAdminData = {
      email: 'test@test.test',
      password: '123456', 
      name: 'Super Admin',
      phoneAreaCode: 7,
      phoneNumber: 9991234567,
      role: 'superadmin',
      companyId: null,
      projectIds: [],
      language: { ru: 'Русский' },
      additionalDocuments: [],
    };
    
    const hashedPassword = await bcrypt.hash(superAdminData.password, 10);
    
    const superAdmin = await User.create({
      ...superAdminData,
      password: hashedPassword,
    });
    
    logger.log('+ SuperAdmin успешно создан!');
    
    await mongoose.disconnect();
    logger.log('Соединение с MongoDB закрыто');
    process.exit(0);
    
  } catch (error) {
    logger.error('Ошибка при создании SuperAdmin:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
