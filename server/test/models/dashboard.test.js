const { expect } = require('chai');

const db = require('../../models');
const { DASHBOARD_TYPE, DASHBOARD_VISIBILITY } = require('../../utils/constants');

const USER_ID = '0cd30aef-9c4e-4a23-88e3-3547971296e5';

// The literal, not the constant: a renamed type must break this test, since the front keys
// (Box.jsx, EditBox.jsx, i18n) use the same string
const groupControlBox = {
  type: 'hawray-group-control',
  name: 'Ceiling lamps',
  device_features: ['lamp-1-brightness', 'lamp-2-brightness'],
};

// db.Dashboard.build(...).validate() runs the Joi schema of the boxes without touching the database
const buildDashboard = (box, name) =>
  db.Dashboard.build({
    name,
    user_id: USER_ID,
    type: DASHBOARD_TYPE.MAIN,
    visibility: DASHBOARD_VISIBILITY.PRIVATE,
    position: 0,
    boxes: [{ columns: [[box]] }],
  });

describe('models/dashboard', () => {
  it('should validate a group control box with a name and device features', async () => {
    await buildDashboard(groupControlBox, 'Group control validation').validate();
  });

  it('should validate a group control box with an empty name', async () => {
    await buildDashboard({ ...groupControlBox, name: '' }, 'Group control empty name').validate();
  });

  it('should reject a group control box with an unknown key', async () => {
    await expect(
      buildDashboard({ ...groupControlBox, unknown_key: true }, 'Group control unknown key').validate(),
    ).to.be.rejectedWith(/is not allowed/);
  });

  it('should save a group control box and read it back unchanged', async () => {
    const created = await db.Dashboard.create({
      name: 'Group control saved',
      user_id: USER_ID,
      type: DASHBOARD_TYPE.MAIN,
      visibility: DASHBOARD_VISIBILITY.PRIVATE,
      position: 0,
      boxes: [{ columns: [[groupControlBox]] }],
    });
    const reloaded = await db.Dashboard.findByPk(created.id);
    expect(reloaded.boxes).to.deep.equal([{ columns: [[groupControlBox]] }]);
  });
});
