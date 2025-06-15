import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const PORT = 5000;

const uri = "mongodb+srv://shivanya:shivanya@cluster0.jmo3kn5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);
let db;

app.use(cors());
app.use(bodyParser.json());

async function connectDB() {
  try {
    await client.connect();
    db = client.db('shivanya'); // your DB name
    console.log('✅ Connected to MongoDB Atlas');

    // 🚀 Start the server **after** DB is connected
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

connectDB();

// Signup route (unchanged)
app.post('/signup', async (req, res) => {
  try {
    const { username, password, isAdmin = false } = req.body;
    const users = db.collection('users');
    const existing = await users.findOne({ username });
    if (existing) return res.status(400).json({ success: false, error: 'User already exists' });

    await users.insertOne({ username, password, isAdmin }); // TODO: hash passwords in production
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login route (unchanged)
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = db.collection('users');
    const user = await users.findOne({ username, password });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    res.json({ success: true, user: { username: user.username, isAdmin: user.isAdmin || false } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Middleware to check admin - example usage (unchanged)
function requireAdmin(req, res, next) {
  const isAdmin = req.headers['x-admin'] === 'true';
  if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
  next();
}

// Admin route example (unchanged)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.collection('users').find().toArray();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// New Route: Add Customer
app.post('/customers', async (req, res) => {
  try {
    const {
      name,
      village,
      fathersName,
      address,
      villageName,
      district,
      postOffice,
      policeStation,
      pincode,
      phone,
      pan,
      aadhar,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required.' });
    }

    const customers = db.collection('customers');

    // Insert document
    const result = await customers.insertOne({
      name,
      village,
      fathersName,
      address,
      villageName,
      district,
      postOffice,
      policeStation,
      pincode,
      phone,
      pan,
      aadhar,
      createdAt: new Date()
    });

    // Fetch the inserted customer document back (including _id)
    const insertedCustomer = await customers.findOne({ _id: result.insertedId });

    // Convert _id to string for easier frontend use
    insertedCustomer._id = insertedCustomer._id.toString();

    // Send back full customer data
    res.json({ success: true, customer: insertedCustomer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/customers', async (req, res) => {
  try {
    const customers = db.collection('customers');
    const allCustomers = await customers.find().toArray();
    res.json({ success: true, customers: allCustomers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new employee
app.post('/employees', async (req, res) => {
  try {
    const {
      name,
      phone,
      salary,
      joiningDate,
      attendanceDetails,
      salaryHistory
    } = req.body;

    if (!name || !salary) {
      return res.status(400).json({ success: false, error: 'Name and salary are required.' });
    }

    const employees = db.collection('employees');

    let processedSalaryHistory = [];
    if (Array.isArray(salaryHistory)) {
      processedSalaryHistory = salaryHistory.map(entry => {
        const decided = entry.decidedSalary || salary;
        const incentiveArray = Array.isArray(entry.incentive) ? entry.incentive : [];
        const totalIncentive = incentiveArray.reduce((sum, i) => sum + i.amount, 0);
        return {
          ...entry,
          decidedSalary: decided,
          incentive: incentiveArray,
          totalPaid: decided + totalIncentive,
          paid: false,
          paidOn: null,
        };
      });
    }

    const newEmployee = {
  name,
  phone: phone || '',
  salary: parseInt(salary),  // 👈 ensure it's stored as a number
  joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
  attendanceDetails: Array.isArray(attendanceDetails) ? attendanceDetails : [],
  salaryHistory: processedSalaryHistory,
  createdAt: new Date()
};


    const result = await employees.insertOne(newEmployee);
    const insertedEmployee = await employees.findOne({ _id: result.insertedId });
    insertedEmployee._id = insertedEmployee._id.toString();

    res.json({ success: true, employee: insertedEmployee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add incentive by employee name
app.post('/employees/incentive/by-name', async (req, res) => {
  try {
    const { name, month, year, incentive, nameShifted, phoneShifted } = req.body;

    if (!name || !month || !year || typeof incentive !== 'number') {
      return res.status(400).json({ success: false, error: 'Name, month, year, and incentive are required.' });
    }

    const employees = db.collection('employees');
    const employee = await employees.findOne({ name: name.trim() });

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    let updated = false;
    const updatedSalaryHistory = (employee.salaryHistory || []).map(entry => {
      if (entry.month === month && entry.year === year) {
        entry.incentive = Array.isArray(entry.incentive) ? entry.incentive : [];

        entry.incentive.push({
          amount: incentive,
          nameShifted: nameShifted || 'Unknown',
          phoneShifted: phoneShifted || '',
          dateShifted: new Date()
        });

        const totalIncentive = entry.incentive.reduce((sum, i) => sum + i.amount, 0);
        entry.totalPaid = (entry.decidedSalary || employee.salary) + totalIncentive;
        entry.paid = entry.paid || false;
        entry.paidOn = entry.paidOn || null;

        updated = true;
      }
      return entry;
    });

    if (!updated) {
      updatedSalaryHistory.push({
        month,
        year,
        decidedSalary: employee.salary,
        incentive: [
          {
            amount: incentive,
            nameShifted: nameShifted || 'Unknown',
            phoneShifted: phoneShifted || '',
            dateShifted: new Date()
          }
        ],
        totalPaid: employee.salary + incentive,
        paid: false,
        paidOn: null
      });
    }

    await employees.updateOne(
      { name: name.trim() },
      { $set: { salaryHistory: updatedSalaryHistory } }
    );

    res.json({ success: true, message: 'Incentive added successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark salary as paid
app.post('/employees/mark-paid', async (req, res) => {
  try {
    const { name, month, year } = req.body;

    if (!name || !month || !year) {
      return res.status(400).json({ success: false, error: 'Name, month, and year are required.' });
    }

    const employees = db.collection('employees');
    const employee = await employees.findOne({ name: name.trim() });

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const updatedSalaryHistory = (employee.salaryHistory || []).map(entry => {
      if (entry.month === month && entry.year === year) {
        entry.paid = true;
        entry.paidOn = new Date();
      }
      return entry;
    });

    await employees.updateOne(
      { name: name.trim() },
      { $set: { salaryHistory: updatedSalaryHistory } }
    );

    res.json({ success: true, message: 'Marked as paid.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});




app.get('/employees', async (req, res) => {
  try {
    const employees = db.collection('employees');
    const employeeList = await employees.find({}).toArray();

    // Convert _id to string for frontend compatibility
    const cleaned = employeeList.map(emp => ({
      ...emp,
      _id: emp._id.toString()
    }));

    res.json({ success: true, employees: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});





app.post('/customers/:id/challan', async (req, res) => {
  try {
    const customerId = req.params.id;

    const {
      challanNo,
      modelno,
      DTO,
      ONE,
      color,
      productNo,
      frameNo,
      engineNo,
      bookNo,
      vehicleNo,
      cylinderNo,
      motorNo,
      tools,
      rear,
      tyreMakeFront,
      mirror,
      keyNo,
      batteryNo
    } = req.body;

    if (!challanNo || !vehicleNo) {
      return res.status(400).json({ success: false, error: 'Challan number and vehicle number are required.' });
    }

    const customers = db.collection('customers');

    // Check if customer exists
    const customer = await customers.findOne({ _id: new ObjectId(customerId) });
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const challan = {
      challanNo,
      modelno,
      DTO,
      ONE,
      color,
      productNo,
      frameNo,
      engineNo,
      bookNo,
      vehicleNo,
      cylinderNo,
      motorNo,
      tools,
      rear,
      tyreMakeFront,
      mirror,
      keyNo,
      batteryNo,
      updatedAt: new Date()
    };

    // ✅ Overwrite challan field (single entry)
    const updateResult = await customers.updateOne(
      { _id: new ObjectId(customerId) },
      { $set: { challan } }
    );

    if (updateResult.modifiedCount === 1) {
      const updatedCustomer = await customers.findOne({ _id: new ObjectId(customerId) });
      updatedCustomer._id = updatedCustomer._id.toString();
      res.json({ success: true, customer: updatedCustomer });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update challan.' });
    }

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/customers/:id/agreement', async (req, res) => {
  try {
    const customerId = req.params.id;

    const {
      exShowroom,
      insurance,
      rto,
      permit,

      bankName,
      loanAmount,
      bankProcessingFee,

      dtoPlace,
      dtoRegisteration,
      dtoOnlinePaymentAmount,

      customerDownPayment,
      customerPaidAmount,

      brokerAmount,
      brokerName,
      brokerPhone,
      brokerVillage,

      otherAmount,
      otherRemark,

      commission,
      paymentDate,
      paymentType,
      remark = [],
    } = req.body;

    const customers = db.collection('customers');

    // Check if customer exists
    const customer = await customers.findOne({ _id: new ObjectId(customerId) });
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    // Convert and ensure numeric fields are safe
    const safeExShowroom = Number(exShowroom) || 0;
    const safeInsurance = Number(insurance) || 0;
    const safeRTO = Number(rto) || 0;
    const safePermit = Number(permit) || 0;

    const safeLoanAmount = Number(loanAmount) || 0;
    const safeBPF = Number(bankProcessingFee) || 0;

    const safeDTORegisteration = Number(dtoRegisteration) || 0;
    const safeDTOOnline = Number(dtoOnlinePaymentAmount) || 0;

    const safeCustomerDP = Number(customerDownPayment) || 0;
    const safeCustomerPaid = Number(customerPaidAmount) || 0;

    const safeBrokerAmount = Number(brokerAmount) || 0;
    const safeOtherAmount = Number(otherAmount) || 0;
    const safeCommission = Number(commission) || 0;

    // Derived values
    const onRoadPrice = safeExShowroom + safeInsurance + safeRTO + safePermit;
    const magadhMargin = (safeExShowroom + safeInsurance + safeBPF) - safeLoanAmount;

    const dtoTotal = safeDTORegisteration + safeDTOOnline + safePermit;
    const downPayment = onRoadPrice - safeLoanAmount;
    const dues = safeCustomerDP - safeCustomerPaid;

    const profit = safeCustomerDP - (magadhMargin + dtoTotal + safeBrokerAmount + safeOtherAmount);
    const netProfit = safeCommission + profit;

    const agreement = {
      exShowroom: safeExShowroom,
      insurance: safeInsurance,
      rto: safeRTO,
      permit: safePermit,
      onRoadPrice,

      bankName,
      loanAmount: safeLoanAmount,
      bankProcessingFee: safeBPF,

      dtoPlace,
      dtoRegisteration: safeDTORegisteration,
      dtoOnlinePaymentAmount: safeDTOOnline,
      dtoTotal,

      magadhMargin,
      downPayment,
      customerDownPayment: safeCustomerDP,
      customerPaidAmount: safeCustomerPaid,

      brokerAmount: safeBrokerAmount,
      brokerName,
      brokerPhone,
      brokerVillage,

      otherAmount: safeOtherAmount,
      otherRemark,

      dues,
      profit,
      commission: safeCommission,
      netProfit,

      paymentDate,
      paymentType,
      remark: Array.isArray(remark) ? remark : [],
      updatedAt: new Date(),
    };

    const updateResult = await customers.updateOne(
      { _id: new ObjectId(customerId) },
      { $set: { agreement } }
    );

    if (updateResult.modifiedCount === 1) {
      const updatedCustomer = await customers.findOne({ _id: new ObjectId(customerId) });
      updatedCustomer._id = updatedCustomer._id.toString();
      res.json({ success: true, customer: updatedCustomer });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update agreement.' });
    }

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});






app.post('/settings/models', async (req, res) => {
  try {
    const { modelName, exShowroom, insurance, rto, permit, _id } = req.body;

    if (!modelName || exShowroom == null || insurance == null || rto == null || permit == null) {
      return res.status(400).json({ success: false, error: 'All model fields are required.' });
    }

    const safeExShowroom = Number(exShowroom);
    const safeInsurance = Number(insurance);
    const safeRTO = Number(rto);
    const safePermit = Number(permit);

    const onRoadPrice = safeExShowroom + safeInsurance + safeRTO + safePermit;

    const model = {
      modelName,
      exShowroom: safeExShowroom,
      insurance: safeInsurance,
      rto: safeRTO,
      permit: safePermit,
      onRoadPrice,
      updatedAt: new Date()
    };

    const settings = db.collection('settings');

    if (_id) {
      if (!ObjectId.isValid(_id)) {
        return res.status(400).json({ success: false, error: 'Invalid model ID.' });
      }

      const result = await settings.updateOne(
        { _id: new ObjectId(_id), type: 'model' },
        { $set: model }
      );

      if (result.modifiedCount === 1) {
        res.json({ success: true, message: 'Model updated successfully.' });
      } else {
        res.status(404).json({ success: false, error: 'Model not found.' });
      }
    } else {
      const result = await settings.insertOne({ type: 'model', ...model });
      res.json({ success: true, message: 'Model added successfully.', modelId: result.insertedId });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/settings/models', async (req, res) => {
  try {
    const models = db.collection('settings');
    const allModels = await models.find().toArray();
    res.json({ success: true, models: allModels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a model by name
app.get('/settings/model/:name', async (req, res) => {
  try {
    const modelName = req.params.name;
    const models = db.collection('settings');
    const model = await models.findOne({ modelName: modelName.trim() });
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found.' });
    }
    res.json({ success: true, model });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Add this at the bottom of server.js
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Serve Vite frontend in production (important for packaged Electron app)
// if (process.env.NODE_ENV === 'production') {
//   const buildPath = path.join(__dirname, 'dist');
//   app.use(express.static(buildPath));

//   app.get('*', (req, res) => {
//     res.sendFile(path.join(buildPath, 'index.html'));
//   });
// }
