import type { Request, Response, NextFunction } from 'express';
import { createLawyerSchema, updateLawyerSchema } from '../schemas/lawyer.schema';
import type { LawyerService } from '../services/lawyer.service';

export class LawyerController {
  constructor(private readonly lawyerService: LawyerService) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lawyers = await this.lawyerService.list();
      res.json(lawyers);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lawyer = await this.lawyerService.getById(req.params.id);
      res.json(lawyer);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = createLawyerSchema.parse(req.body);
      const lawyer = await this.lawyerService.create(data);
      res.status(201).json(lawyer);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateLawyerSchema.parse(req.body);
      const lawyer = await this.lawyerService.update(req.params.id, data);
      res.json(lawyer);
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.lawyerService.delete(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
