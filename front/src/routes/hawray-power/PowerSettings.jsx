import { Component } from 'preact';
import { Text } from 'preact-i18n';

// The mains override (spec §3): '' means auto-detection. Any logged-in user may change it.
class PowerSettings extends Component {
  state = { selected: undefined };

  handleChange = event => {
    this.setState({ selected: event.target.value });
  };

  handleSubmit = event => {
    event.preventDefault();
    const current = this.state.selected === undefined ? this.props.mainsOverride || '' : this.state.selected;
    this.props.onSave(current || null);
  };

  render({ devices, mainsOverride, status, saving }, { selected }) {
    const value = selected === undefined ? mainsOverride || '' : selected;
    return (
      <div class="card mb-0">
        <div class="card-body">
          <h2 class="h5">
            <Text id="hawrayPower.settings.title" />
          </h2>
          <p class="text-muted small">
            <Text id="hawrayPower.settings.hint" />
          </p>
          <form class="d-flex flex-wrap align-items-end" onSubmit={this.handleSubmit}>
            <div class="form-group mr-2 mb-2">
              <label for="hawray-power-mains-select" class="small text-muted mb-1">
                <Text id="hawrayPower.settings.mainsLabel" />
              </label>
              <select
                id="hawray-power-mains-select"
                class="form-control custom-select"
                value={value}
                onChange={this.handleChange}
              >
                <option value="">
                  <Text id="hawrayPower.settings.auto" />
                </option>
                {devices.map(device => (
                  <option key={device.selector} value={device.selector}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" class="btn btn-primary mb-2" disabled={saving}>
              <Text id="hawrayPower.settings.save" />
            </button>
          </form>
          {status === 'saved' && (
            <div class="alert alert-success mt-2 mb-0">
              <Text id="hawrayPower.settings.saved" />
            </div>
          )}
          {status === 'error' && (
            <div class="alert alert-danger mt-2 mb-0">
              <Text id="hawrayPower.settings.error" />
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default PowerSettings;
