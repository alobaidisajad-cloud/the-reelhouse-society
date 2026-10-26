import ExpoModulesCore
import UIKit

/// An opened locked room covered while the app is away (modules/room-cover/index.ts says why).
/// While asked to, the house's ink is laid over the window as the app resigns active, so the
/// app switcher's picture holds nothing of the room, and lifted as the app becomes active again.
public class RoomCoverModule: Module {
  private var wanted = false
  private var cover: UIView?
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("RoomCover")

    OnCreate {
      let center = NotificationCenter.default
      self.observers = [
        center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
          self?.raise()
        },
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
          self?.lift()
        },
      ]
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers = []
    }

    AsyncFunction("setCovered") { (on: Bool) in
      self.wanted = on
      if !on { self.lift() }
    }
    .runOnQueue(.main)
  }

  private func raise() {
    guard wanted, cover == nil, let window = keyWindow() else { return }
    let ink = UIView(frame: window.bounds)
    // The house's ink, colors.ink (#0D0B09): the room's own ground, nothing on it.
    ink.backgroundColor = UIColor(red: 13 / 255, green: 11 / 255, blue: 9 / 255, alpha: 1)
    ink.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    window.addSubview(ink)
    cover = ink
  }

  private func lift() {
    cover?.removeFromSuperview()
    cover = nil
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}
